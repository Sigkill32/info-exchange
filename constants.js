const HEARTBEAT_INTERVAL_MS = 30_000;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const STATUS_BITS = {
  ONLINE: 1,
  OFFLINE: 0,
};

module.exports = { HEARTBEAT_INTERVAL_MS, MIME_TYPES, STATUS_BITS };
