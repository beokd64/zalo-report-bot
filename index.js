require("dotenv").config();

const express = require("express");
const cron = require("node-cron");
const axios = require("axios");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express(); // ❌ removed duplicate later
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const store = require("./store");
const { uploadFileFromUrl } = require("./google/drive");
const { submitToGoogleForm } = require("./google/form");
const { chatComplete } = require("./ai");

const GROUP_ID =
  process.env.ZALO_GROUP_ID || "group:3421414480936586205";

const OPENCLAW_BRIDGE_URL =
  process.env.OPENCLAW_BRIDGE_URL ||
  "https://giddy-jittery-starving.ngrok-free.dev";

// ─────────────────────────────────────────────
// SOCKET.IO (LIVE DASHBOARD)
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("[Dashboard] connected");

  // send initial state
  socket.emit("init", {
    messages: store.getRecentMessages(50),
    isCollecting: store.isCollecting()
  });
});

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "dashboard")));

// ─────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).send("Zalo Report Bot is running");
});

// ─────────────────────────────────────────────
// OPENCLAW SEND
// ─────────────────────────────────────────────
async function sendGroupMessage(text) {
  try {
    const res = await axios.post(`${OPENCLAW_BRIDGE_URL}/send`, { text });
    console.log("[OpenClaw] Message sent:", res.data);
    return res.data;
  } catch (err) {
    console.error("[OpenClaw] Send error:", err.message);
  }
}

// ─────────────────────────────────────────────
// WEBHOOK (🔥 MAIN FIX HERE)
// ─────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const event = req.body;
  if (!event) return;

  const sender = event.sender || event.user || {};
  const message = event.message || {};

  const group_id =
    event.group_id ||
    event.groupId ||
    event.threadId ||
    event.rawEvent?.threadId ||
    event.sessionKey?.split(":").pop();

  const text =
    message.text ||
    event.text ||
    event.content ||
    "";

  const userId =
    sender.id ||
    event.senderId ||
    "unknown";

  const userName =
    sender.display_name ||
    sender.name ||
    event.senderName ||
    `User_${userId}`;

  // ignore wrong group
  if (GROUP_ID && group_id && group_id !== GROUP_ID) {
    console.log(`[Webhook] Ignored group_id: ${group_id}`);
    return;
  }

  // ignore empty
  if (!text) return;

  console.log(`[Webhook] ${userName}: ${text}`);

  // ─────────────────────────────
  // SAVE
  // ─────────────────────────────
  store.addMessage({
    userId,
    userName,
    text,
    timestamp: Date.now(),
  });

  store.queueSubmission(userId, userName);

  // ─────────────────────────────
  // 🔥 LIVE DASHBOARD UPDATE
  // ─────────────────────────────
  io.emit("group_message", {
    userId,
    userName,
    text,
    groupId: group_id,
    timestamp: Date.now()
  });

  scheduleProcessing(userId, userName);
});

// ─────────────────────────────────────────────
// MESSAGE SCHEDULING (unchanged)
// ─────────────────────────────────────────────
const pendingTimers = new Map();

function scheduleProcessing(userId, userName) {
  if (pendingTimers.has(userId)) {
    clearTimeout(pendingTimers.get(userId));
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(userId);

    processSubmission({ userId, userName }).catch(console.error);
  }, 8000);

  pendingTimers.set(userId, timer);
}

// ─────────────────────────────────────────────
// DASHBOARD API
// ─────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    isCollecting: store.isCollecting(),
    messages: store.getRecentMessages(50),
  });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});