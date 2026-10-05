const createMessages = (type, payload) => {
  switch (type) {
    case "ONLINE_STATUS": {
      return {
        ...payload,
        type: "ONLINE_STATUS",
      };
    }
  }
  return message;
};

const tryCatchDecorator = (fn, onDone) => {
  return async (...args) => {
    try {
      const result = await fn(...args);
      onDone(null, result);
    } catch (error) {
      onDone(error);
    }
  };
};

module.exports = {
  createMessages,
  tryCatchDecorator,
};
