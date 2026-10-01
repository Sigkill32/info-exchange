const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const { createMessages } = require("./utils");
const { HEARTBEAT_INTERVAL_MS, MIME_TYPES } = require("./constants");
const queryService = require("./queryService");

// 1. IMPORT WEB-PUSH AND DEFINE KEYS
const webPush = require("web-push");

// Generate these once using: npx web-push generate-vapid-keys
const vapidKeys = {
  publicKey:
    "BFt9r3dkn7CPXsAOLlPiRFc1jpTmq4WKhs9vjKwOLqlDQNm8Ix2CUPVZLXYESYhY9PgU41egCwOvQKuGwhY7NPo",
  privateKey: "EsZLixs1SnUQOWrBYM4Dy0lIzsyXkD517wjHqf7MuGU",
};

webPush.setVapidDetails(
  "mailto:your-email@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

// In-memory store for mapping usernames to push subscriptions.
// (For production, store these in your database alongside user profiles)
const pushSubscriptions = {};

const httpServer = http.createServer((req, res) => {
  // 2. ADD HTTP ENDPOINT TO SAVE SUBSCRIPTIONS FROM PWA FRONTEND
  if (req.method === "POST" && req.url === "/api/save-subscription") {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        const { username, subscription } = JSON.parse(body);
        if (!username || !subscription) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing required fields" }));
        }

        pushSubscriptions[username] = subscription;
        console.log(`[Push Server] Saved subscription for user: ${username}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      }
    });
    return; // Prevent static file serving from taking over this route
  }

  let filePath = req.url === "/" ? "/index.html" : req.url;
  const fullPath = path.join(__dirname, "public", filePath);

  const extname = path.extname(fullPath);
  let contentType = MIME_TYPES[extname];

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>", "utf-8");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);

const webSocketServer = new WebSocketServer({ server: httpServer });

const connections = {};
let dbWriteQueue = [];

const heartbeatInterval = setInterval(() => {
  webSocketServer.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

async function flushQueueToDatabase() {
  if (dbWriteQueue.length === 0) return;

  const batchToWrite = [...dbWriteQueue];
  dbWriteQueue = [];

  try {
    await queryService.updateMessagesBulk(batchToWrite);
    console.log(`[DB Flush] Successfully committed batch.`);
  } catch (error) {
    console.error(
      "[DB Flush] Failed to write batch to database. Restoring queue items.",
      error,
    );
    dbWriteQueue = [...batchToWrite, ...dbWriteQueue];
  }
}

const FLUSH_INTERVAL_MS = 3000;
const dbFlushInterval = setInterval(flushQueueToDatabase, FLUSH_INTERVAL_MS);

webSocketServer.on("close", () => {
  clearInterval(heartbeatInterval);
  clearInterval(dbFlushInterval);
});

const updateQueue = (source, destination, message) => {
  dbWriteQueue.push({
    source: source,
    destination: destination,
    message: message,
  });

  if (dbWriteQueue.length >= 100) {
    flushQueueToDatabase();
  }
};

webSocketServer.on("connection", (ws, req) => {
  console.log("connection opened", req.url);
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const myUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const urlParams = myUrl.searchParams;
  const username = urlParams.get("username");
  const targetusername = urlParams.get("targetusername");
  const latestMessageTimeStamp = urlParams.get("latestMessageTimeStamp");

  queryService.getFullConversation(username, targetusername).then((data) => {
    const [error, messages] = data;
    if (error) {
      console.log("Error fetching full conversation:", error);
      ws.send(JSON.stringify([]));
    } else {
      ws.send(JSON.stringify(messages));
    }
  });

  queryService
    .createUserConnection(username, 1)
    .then(() => {
      console.log(
        "[connection DB] write connection status of " + username + "to DB",
      );
    })
    .catch((err) =>
      console.log(
        "[connection DB] failed to write" + username + " connection to DB",
      ),
    );

  connections[username] = ws;
  ws.username = username;
  ws.targetusername = targetusername;

  console.log("Connected user:", { username, targetusername });

  const onlineStatusMessage = createMessages("ONLINE_STATUS", {
    users: Object.keys(connections),
  });
  Object.values(connections).forEach((connection) =>
    connection.send(JSON.stringify(onlineStatusMessage)),
  );

  ws.on("message", (data) => {
    const { targetusername, username } = ws;
    let message;
    try {
      message = JSON.parse(data.toString("utf-8"));
    } catch (e) {
      message = data.toString("utf-8");
    }
    const userMessage = createMessages("TEXT_MESSAGE", {
      message,
      source_username: username,
      destination_username: targetusername,
    });

    updateQueue(username, targetusername, message);

    // 3. ROUTE MESSAGES ACCORDING TO STATE (ONLINE VS APP CLOSED)
    if (targetusername in connections) {
      // Recipient is online. Send via active WebSocket connection.
      connections[targetusername].send(JSON.stringify([userMessage]));
    } else if (pushSubscriptions[targetusername]) {
      // Recipient app is closed. Fall back to standard Web Push.
      const pushPayload = JSON.stringify({
        title: "New Message",
        body: typeof message === "string" ? message : "You have a new update",
        from: username,
      });

      webPush
        .sendNotification(pushSubscriptions[targetusername], pushPayload)
        .catch((error) => {
          console.error("[Push Error] Failed to route web push:", error);
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription expired or uninstalled, clean memory
            delete pushSubscriptions[targetusername];
          }
        });
    }

    const notification = JSON.stringify({
      type: "notification",
      from: username,
    });
    webSocketServer.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(notification);
      }
    });
  });

  ws.on("close", () => {
    console.log(`Connection closed for user: ${username}`);
    queryService
      .createUserConnection(username, 0)
      .then(() => {
        console.log(
          "[connection DB] write connection status of " + username + "to DB",
        );
      })
      .catch((err) =>
        console.log(
          "[connection DB] failed to write" + username + " connection to DB",
        ),
      );
    if (connections[username] === ws) {
      delete connections[username];
    }
    const onlineStatusMessage = createMessages("ONLINE_STATUS", {
      users: Object.keys(connections),
    });
    Object.values(connections).forEach((connection) =>
      connection.send(JSON.stringify(onlineStatusMessage)),
    );
  });
});
