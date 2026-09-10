let username = "";
let targetusername = "";
let socket = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
const MAX_RECONNECT_DELAY_MS = 30_000;

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

const createChatBubble = (message, source) => {
    const chatBubble = document.createElement('div');
    chatBubble.classList.add('chatScreen_conversationContainer_chatBubble');
    const sourceElement = document.createElement('p');
    sourceElement.classList.add('chatScreen_conversationContainer_chatBubble_source');
    sourceElement.textContent = source;
    const mesageElement = document.createElement("p");
    mesageElement.classList.add("chatScreen_conversationContainer_chatBubble_message");
    mesageElement.textContent = message;
    chatBubble.appendChild(sourceElement);
    chatBubble.appendChild(mesageElement);
    return chatBubble;
}

const createAndAppendMessage = (messages, source) => {
    const messagesFragment = document.createDocumentFragment();
    messages.forEach(message => {
        const chatBubble = createChatBubble(message, source);
        messagesFragment.appendChild(chatBubble);
    })
    const conversationContainer = document.querySelector(".chatScreen_conversationContainer");
    conversationContainer.appendChild(messagesFragment);
}

const showStatus = (msg) => {
    let bar = document.getElementById("statusBar");
    if (!bar) {
        bar = document.createElement("p");
        bar.id = "statusBar";
        bar.style.cssText = "margin:4px 0;font-size:0.8em;color:#888;text-align:center;";
        document.querySelector(".chatScreen").prepend(bar);
    }
    bar.textContent = msg;
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
            } else if (data.type === "notification" && Notification.permission === "granted" && document.hidden) {
                new Notification(`New message from ${data.from}`);
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
        const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
        showStatus(`Reconnecting in ${Math.round(delay / 1000)}s… (attempt ${reconnectAttempt})`);
        reconnectTimer = setTimeout(connectSocket, delay);
    };
};

const onStartChat = () => {
    document.querySelector(".initScreen").classList.add("hidden");
    username = document.getElementById("username").value;
    targetusername = document.getElementById("targetusername").value;
    document.getElementById("targetUserNameTitle").textContent = targetusername;

    const conversationContainer = document.querySelector(".chatScreen_conversationContainer");
    conversationContainer.style.height = window.innerHeight * 0.7 + "px";

    document.querySelector(".chatScreen").classList.remove("hidden");

    connectSocket();
};

const handleSendMessage = () => {
    const messageInput = document.getElementById("message");
    const message = messageInput.value;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Cannot send message. You are currently offline.");
        return;
    }

    if (message.length > 0) {
        socket.send(JSON.stringify(message));
        createAndAppendMessage([message], username);
        messageInput.value = "";
    }
}

sendMessage.addEventListener("click", handleSendMessage);

startChatting.addEventListener("click", onStartChat);