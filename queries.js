const db = require("./db");

const getUserConnection = async (username) => {
  const queryText = "SELECT * FROM connections WHERE username = $1";
  const { rows } = await db.query(queryText, [username]);
  return rows;
};

const createUserConnection = async (username, status) => {
  const queryText =
    "INSERT INTO connections (username, status) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET status = $2 RETURNING *";
  const { rows } = await db.query(queryText, [username, status]);
  return rows[0];
};

const updateMessage = async (source, destination, message) => {
  const queryText =
    "INSERT INTO messages (source_username, destination_username, message) VALUES ($1, $2, $3) RETURNING *";
  const { rows } = await db.query(queryText, [source, destination, message]);
  return rows[0];
};

const getFullConversation = async (username, destination) => {
  const queryText =
    "SELECT * FROM messages WHERE (source_username IN ($1, $2) OR destination_username IN ($2, $1)) ORDER BY id DESC LIMIT 200";
  const { rows } = await db.query(queryText, [username, destination]);
  return rows;
};

const getUserMessages = async (username, destination) => {
  const queryText =
    "SELECT source_username, message, created_at FROM messages WHERE destination_username = $1";
  const { rows } = await db.query(queryText, [username]);
  return rows;
};

const getConversationAfter = async (username, destination, lastId) => {
  const queryText =
    "SELECT * FROM messages WHERE (source_username IN ($1, $2) OR destination_username IN ($2, $1)) AND id > $3 ORDER BY id DESC LIMIT 200";
  const { rows } = await db.query(queryText, [username, destination, lastId]);
  return rows;
};

const deleteUserMessages = async (username) => {
  const queryText = "DELETE FROM messages WHERE destination_username = $1";
  const { rows } = await db.query(queryText, [username]);
  return rows;
};

const updateMessagesBulk = async (messagesArray) => {
  if (!messagesArray || messagesArray.length === 0) return [];

  const values = [];
  const valuePlaceholders = [];
  let index = 1;

  for (const msg of messagesArray) {
    valuePlaceholders.push(`($${index}, $${index + 1}, $${index + 2})`);
    values.push(msg.source, msg.destination, msg.message);
    index += 3;
  }

  const queryText = `
    INSERT INTO messages (source_username, destination_username, message) 
    VALUES ${valuePlaceholders.join(", ")} 
    RETURNING *;
  `;

  const { rows } = await db.query(queryText, values);
  return rows;
};

module.exports = {
  getUserConnection,
  createUserConnection,
  updateMessage,
  getUserMessages,
  updateMessagesBulk,
  deleteUserMessages,
  getFullConversation,
  getConversationAfter,
};
