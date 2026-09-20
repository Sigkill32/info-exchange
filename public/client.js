let username = "";
let targetusername = "";
let socket = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
const MAX_RECONNECT_DELAY_MS = 30_000;

const generateTimeStamp = () => {
  const date = new Date();
  const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
  const amPM = date.getHours() > 12 ? "pm" : "am";
  const minutes =
    date.getMinutes() > 9 ? date.getMinutes() : "0" + date.getMinutes();
  const time = `${hours}:${minutes} ${amPM}`;
  return time;
};

const registerServiceWorker = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.installing) {
          console.log("Installing service worker");
        }
        if (registration.waiting) {
          console.log("waitin.....");
        }
        if (registration.active) {
          console.log("service worker successfully installed");
        }
      })
      .catch((error) => {
        console.error("An error ocured during sw installation", error);
      });
  }
};

registerServiceWorker();

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
let wsUri = `${wsProtocol}//${window.location.host}`;

const startChatting = document.getElementById("startChatting");
const sendMessage = document.getElementById("sendMessage");
const enableNotificationsBtn = document.getElementById("enableNotifications");

const updateNotificationButton = () => {
  if (!("Notification" in window)) {
    enableNotificationsBtn.textContent = "Notifications not supported";
    enableNotificationsBtn.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    enableNotificationsBtn.textContent = "Notifications enabled";
    enableNotificationsBtn.disabled = true;
  } else if (Notification.permission === "denied") {
    enableNotificationsBtn.textContent = "Notifications blocked";
    enableNotificationsBtn.disabled = true;
  }
};

enableNotificationsBtn.addEventListener("click", () => {
  Notification.requestPermission().then(updateNotificationButton);
});

const createChatBubble = (message, source, created_at) => {
  const chatBubble = document.createElement("div");
  chatBubble.classList.add("chatScreen_conversationContainer_chatBubble");
  const sourceElement = document.createElement("p");
  sourceElement.classList.add(
    "chatScreen_conversationContainer_chatBubble_source",
  );
  sourceElement.textContent = `${source} [${created_at}]`;
  const mesageElement = document.createElement("p");
  mesageElement.classList.add(
    "chatScreen_conversationContainer_chatBubble_message",
  );
  mesageElement.textContent = message;
  chatBubble.appendChild(sourceElement);
  chatBubble.appendChild(mesageElement);
  return chatBubble;
};

const createAndAppendMessage = (messages, source) => {
  // if a messages are of type array then they ARE text messages
  const messagesFragment = document.createDocumentFragment();
  messages.forEach((message) => {
    const chatBubble = createChatBubble(
      message.message,
      source,
      message.created_at,
    );
    messagesFragment.appendChild(chatBubble);
  });
  const conversationContainer = document.querySelector(
    ".chatScreen_conversationContainer",
  );
  conversationContainer.appendChild(messagesFragment);
  conversationContainer.scrollTop = conversationContainer.scrollHeight;
};

const showStatus = (msg) => {
  let bar = document.getElementById("statusBar");
  bar.textContent = msg;
};

const setOnlineStatus = (data) => {
  const targetUser = document.getElementById("targetUserNameTitle");
  if (data.users.includes(targetusername)) {
    targetUser.style.color = "green";
  } else {
    targetUser.style.color = "black";
  }
};

const connectSocket = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  socket = new WebSocket(
    `${wsUri}?username=${encodeURIComponent(username)}&targetusername=${encodeURIComponent(targetusername)}`,
  );

  socket.onopen = () => {
    reconnectAttempt = 0;
    showStatus("Connected");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (Array.isArray(data)) {
        createAndAppendMessage(data, targetusername);
      } else {
        switch (data.type) {
          case "notification": {
            if (Notification.permission == "granted" && document.hidden) {
              new Notification(`New message from ${data.from}`);
            }
            break;
          }
          case "ONLINE_STATUS": {
            setOnlineStatus(data);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Failed to parse incoming WebSocket message:", error);
    }
  };

  socket.onerror = () => {
    // onclose fires right after; handle reconnect there
  };

  socket.onclose = (event) => {
    if (event.wasClean) {
      showStatus("Disconnected");
      return;
    }
    reconnectAttempt += 1;
    const delay = Math.min(
      1000 * 2 ** reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    showStatus(
      `Reconnecting in ${Math.round(delay / 1000)}s… (attempt ${reconnectAttempt})`,
    );
    reconnectTimer = setTimeout(connectSocket, delay);
  };
};

const onStartChat = () => {
  document.querySelector(".initScreen").classList.add("hidden");
  username = document.getElementById("username").value;
  targetusername = document.getElementById("targetusername").value;
  document.getElementById("targetUserNameTitle").textContent = targetusername;

  document.querySelector(".chatScreen").classList.remove("hidden");

  connectSocket();
};

const handleSendMessage = () => {
  const messageInput = document.getElementById("message");
  const message = messageInput.value;

  const userMessage = {
    message: message,
    created_at: generateTimeStamp(),
    type: "TEXT_MESSAGE",
  };

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert("Cannot send message. You are currently offline.");
    return;
  }

  if (message.length > 0) {
    socket.send(JSON.stringify(userMessage));
    createAndAppendMessage([userMessage], username);
    messageInput.value = "";
  }
};

document
  .querySelector(".chatScreen_inputcontainer")
  .addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      handleSendMessage();
    }
  });

sendMessage.addEventListener("click", handleSendMessage);

startChatting.addEventListener("click", onStartChat);
