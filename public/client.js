let username = "";
let targetusername = "";
let socket = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
const MAX_RECONNECT_DELAY_MS = 30_000;
let lastSequenceId = 0;
let settingsToggleState = false;

// ADD YOUR PUBLIC VAPID KEY HERE (Generated from backend setup)
const PUBLIC_VAPID_KEY =
  "BFt9r3dkn7CPXsAOLlPiRFc1jpTmq4WKhs9vjKwOLqlDQNm8Ix2CUPVZLXYESYhY9PgU41egCwOvQKuGwhY7NPo";

// Helper function needed to convert base64 VAPID key to UInt8Array for the browser
const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

function createReadableTime(utcTimestamp) {
  const date = new Date(utcTimestamp);

  // 1. Get the current date and the message date in the IST time zone string (YYYY-MM-DD format)
  const optionsDateOnly = {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };

  // Formatters to extract localized components safely
  const formatter = new Intl.DateTimeFormat("en-IN", optionsDateOnly);
  const nowParts = formatter.formatToParts(new Date());
  const dateParts = formatter.formatToParts(date);

  const getISOString = (parts) =>
    `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;

  const nowISTStr = getISOString(nowParts);
  const dateISTStr = getISOString(dateParts);

  // Calculate Yesterday in IST
  const todayIST = new Date(nowISTStr);
  const yesterdayIST = new Date(todayIST);
  yesterdayIST.setDate(todayIST.getDate() - 1);
  const yesterdayISTStr = yesterdayIST.toISOString().split("T")[0];

  // 2. Format the time component in 12-hour IST format (e.g., "05:59 am")
  const istTime = date
    .toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

  // 3. Determine the prefix date label
  let dateLabel = "";
  if (dateISTStr === nowISTStr) {
    dateLabel = "Today";
  } else if (dateISTStr === yesterdayISTStr) {
    dateLabel = "Yesterday";
  } else {
    // For older dates, format as "DD-MMM-YYYY" (e.g., "02-Oct-2026")
    dateLabel = date.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return `${dateLabel}, ${istTime}`;
}

const registerServiceWorker = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (registration.installing) console.log("Installing service worker");
        if (registration.waiting) console.log("waitin.....");
        if (registration.active)
          console.log("service worker successfully installed");
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

// NEW: Generates push registration tokens and updates backend routing mappings
const configurePushSubscription = async (user) => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check if an active subscription token already exists
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create a fresh subscription channel linked directly to your VAPID key
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });
    }

    // Deliver subscription credentials safely over HTTP to your node.js server
    await fetch("/api/save-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user,
        subscription: subscription,
      }),
    });
    console.log(
      "[Push Client] Subscription successfully sent to backend mapping.",
    );
  } catch (error) {
    console.error(
      "[Push Client] Failed to register subscription channel:",
      error,
    );
  }
};

enableNotificationsBtn.addEventListener("click", () => {
  Notification.requestPermission().then((permission) => {
    updateNotificationButton();
    // If the user logs in first, then hits allow notifications, immediately sync
    if (permission === "granted" && username) {
      configurePushSubscription(username);
    }
  });
});

const createChatBubble = (messageObj) => {
  const { source_username, message, created_at } = messageObj;
  const chatItem = document.createElement("div");
  chatItem.classList.add("chatScreen_conversationContainer_chatItem");
  if (source_username == username) chatItem.classList.add("chat_flexEnd");
  const chatBubble = document.createElement("div");
  chatBubble.classList.add("chatScreen_conversationContainer_chatBubble");
  if (source_username == username)
    chatBubble.classList.add("chatBubble_incoming");
  const sourceElement = document.createElement("p");
  sourceElement.classList.add(
    "chatScreen_conversationContainer_chatBubble_source",
  );
  sourceElement.textContent = createReadableTime(created_at);
  const mesageElement = document.createElement("p");
  mesageElement.classList.add(
    "chatScreen_conversationContainer_chatBubble_message",
  );
  mesageElement.textContent = message;
  chatBubble.appendChild(sourceElement);
  chatBubble.appendChild(mesageElement);
  chatItem.appendChild(chatBubble);
  return chatItem;
};

const createAndAppendMessage = (messages) => {
  document.querySelector(".loadingOverlay").classList.add("hidden");
  const messagesLen = messages.length;
  if (!messagesLen) return;
  const messagesFragment = document.createDocumentFragment();
  for (let i = messagesLen - 1; i >= 0; i -= 1) {
    const chatBubble = createChatBubble(messages[i]);
    messagesFragment.appendChild(chatBubble);
  }
  lastSequenceId = messages[0].id;
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

  let url = `${wsUri}?username=${encodeURIComponent(username)}&targetusername=${encodeURIComponent(targetusername)}&lastSequenceId=${encodeURIComponent(lastSequenceId)}`;

  socket = new WebSocket(url);

  socket.onopen = () => {
    reconnectAttempt = 0;
    showStatus("Connected");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (Array.isArray(data)) {
        createAndAppendMessage(data);
      } else {
        switch (data.type) {
          case "notification": {
            // Use SW-based notification so it works even when browsers block page-context Notification()
            if (Notification.permission === "granted" && document.hidden) {
              navigator.serviceWorker.ready.then((reg) =>
                reg.showNotification(`New message from ${data.from}`, {
                  icon: "/images/icon-128.png",
                }),
              );
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

  socket.onerror = () => {};

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
  username = document.getElementById("username").value;
  targetusername = document.getElementById("targetusername").value;
  localStorage.setItem("username", username);
  localStorage.setItem("targetusername", targetusername);
  hideInitScreenAndStartChatting();
};

const handleSendMessage = () => {
  const messageInput = document.getElementById("message");
  const message = messageInput.value;

  const userMessage = {
    message: message,
    created_at: new Date().toISOString(),
    source_username: username,
    destination_username: targetusername,
  };

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert("Cannot send message. You are currently offline.");
    return;
  }

  if (message.length > 0) {
    socket.send(JSON.stringify(message));
    createAndAppendMessage([userMessage]);
    messageInput.value = "";
  }
};

const hideInitScreenAndStartChatting = () => {
  document.querySelector(".initScreen").classList.add("hidden");
  document.getElementById("targetUserNameTitle").textContent = targetusername;

  document.querySelector(".chatScreen").classList.remove("hidden");

  // TRIGGER SUBSCRIPTION LINKING AS SOON AS USER LOGS IN
  configurePushSubscription(username);

  connectSocket();
  document.querySelector(".loadingOverlay").classList.remove("hidden");
};

const initActions = () => {
  if (localStorage.getItem("username")) {
    username = localStorage.getItem("username");
    targetusername = localStorage.getItem("targetusername");
    hideInitScreenAndStartChatting();
  }
};

initActions();

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("username");
  localStorage.removeItem("targetusername");
  location.reload();
});

document.getElementById("chatSettings").addEventListener("click", () => {
  const settingsContainer = document.querySelector(
    ".chatScreen_settings_container",
  );
  if (!settingsToggleState) {
    settingsContainer.classList.remove("hidden");
  } else {
    settingsContainer.classList.add("hidden");
  }
  settingsToggleState = !settingsToggleState;
});

document
  .querySelector(".chatScreen_inputcontainer")
  .addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      handleSendMessage();
    }
  });

sendMessage.addEventListener("click", handleSendMessage);
startChatting.addEventListener("click", onStartChat);
// Initialize button UI state on startup
updateNotificationButton();
