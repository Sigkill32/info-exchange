const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const { createMessages } = require("./utils");
const { HEARTBEAT_INTERVAL_MS, MIME_TYPES } = require("./constants");
const queryService = require("./queryService");

const httpServer = http.createServer((req, res) => {
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

  console.log({ dbWriteQueue });

  const batchToWrite = [...dbWriteQueue];
  dbWriteQueue = [];

  console.log(
    `[DB Flush] Writing a batch of ${batchToWrite.length} messages to PostgreSQL...`,
  );

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

const updateQueue = (source, destination, userMessage) => {
  dbWriteQueue.push({
    source: source,
    destination: destination,
    message: userMessage.message,
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
    const userMessage = createMessages("TEXT_MESSAGE", message);
    if (targetusername in connections) {
      connections[targetusername].send(JSON.stringify([userMessage]));
      console.log({ targetusername, username, data: message });
    } else {
      updateQueue(username, targetusername, message);
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
