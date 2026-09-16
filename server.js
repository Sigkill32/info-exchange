const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const { createMessages, tryCatchDecorator } = require("./utils");
const {
  HEARTBEAT_INTERVAL_MS,
  MIME_TYPES,
  STATUS_BIITS,
} = require("./constants");
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
const queue = {};

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

webSocketServer.on("close", () => clearInterval(heartbeatInterval));

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

  queryService.createUserConnection(username, STATUS_BIITS.ONLINE);

  console.log("Connected user:", { username, targetusername });
  const onlineStatusMessage = createMessages("ONLINE_STATUS", {
    users: Object.keys(connections),
  });
  Object.values(connections).forEach((connection) =>
    connection.send(JSON.stringify(onlineStatusMessage)),
  );

  if (username in queue) {
    connections[username].send(JSON.stringify(queue[username].messages));
    delete queue[username];
  }

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
      if (targetusername in queue) {
        queue[targetusername].messages.push(userMessage);
      } else {
        queue[targetusername] = {
          source: ws.username,
          messages: [userMessage],
        };
      }

      console.log(JSON.stringify(queue));
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
