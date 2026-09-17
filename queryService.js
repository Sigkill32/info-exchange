const queries = require("./queries");

const handleQuery = async (queryFn, ...args) => {
  try {
    const data = await queryFn(...args);
    return [null, data];
  } catch (error) {
    console.error(
      `Database Error in ${queryFn.name || "query"}:`,
      error.message,
    );
    return [error, null];
  }
};

module.exports = {
  getUserConnection: (username) =>
    handleQuery(queries.getUserConnection, username),
  createUserConnection: (username, status) =>
    handleQuery(queries.createUserConnection, username, status),
  updateMessage: (source, destination, message) =>
    handleQuery(queries.updateMessage(source, destination, message)),
  getUserMessages: (username) => queries.getUserMessages(username),
};
