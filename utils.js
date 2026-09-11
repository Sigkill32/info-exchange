const generateTimeStamp = () => {
  const date = new Date();
  const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
  const amPM = date.getHours() > 12 ? "pm" : "am";
  const minutes =
    date.getMinutes() > 9 ? date.getMinutes() : "0" + date.getMinutes();
  const time = `${hours}:${minutes} ${amPM}`;
  return time;
};

const createMessages = (type, payload) => {
  switch (type) {
    case "TEXT_MESSAGE": {
      return {
        ...payload,
        type: "TEXT_MESSAGE",
        timeStamp: generateTimeStamp(),
      };
    }

    case "ONLINE_STATUS": {
      return {
        ...payload,
        type: "ONLINE_STATUS",
      };
    }
  }
  return message;
};

module.exports = { generateTimeStamp, createMessages };
