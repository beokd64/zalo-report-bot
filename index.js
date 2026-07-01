require("dotenv").config();

const express = require("express");
const cron = require("node-cron");
const axios = require("axios");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const store = require("./store");
const { uploadFileFromUrl } = require("./google/drive");
const { submitToGoogleForm } = require("./google/form");
const { chatComplete } = require("./ai");

// ─────────────────────────────────────────────
// APP SETUP
// ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const GROUP_ID =
  process.env.ZALO_GROUP_ID || "zalouser:group:3421414480936586205";

const OPENCLAW_BRIDGE_URL =
  process.env.OPENCLAW_BRIDGE_URL ||
  "https://giddy-jittery-starving.ngrok-free.dev";

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve dashboard
app.use(express.static(path.join(__dirname, "dashboard")));

// IMPORTANT: force root to index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard", "index.html"));
});

// ─────────────────────────────────────────────
// SOCKET (LIVE FEED READY)
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("[Dashboard] connected");
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.send("OK");
});

// ─────────────────────────────────────────────
// OPENCLAW SEND MESSAGE
// ─────────────────────────────────────────────
async function sendGroupMessage(text) {
  try {
    const res = await axios.post(`${OPENCLAW_BRIDGE_URL}/send`, { text });
    console.log("[OpenClaw] Sent:", res.data);
    return res.data;
  } catch (err) {
    console.error("[OpenClaw] Error:", err.message);
  }
}

// ─────────────────────────────────────────────
// WEEKLY MESSAGE
// ─────────────────────────────────────────────
async function sendReportRequest() {
  const week = getWeekLabel();

  const msg =
    `📋 Weekly Report – ${week}\n\n` +
    `Please submit:\n• Progress\n• Issues\n• Plan`;

  await sendGroupMessage(msg);
  store.startCollection(week);

  console.log("[Bot] Weekly request sent");
}

// ─────────────────────────────────────────────
// WEBHOOK FROM OPENCLAW
// ─────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("========== WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);

  const event = req.body;
  if (!event) return;

  const sender = event.sender || {};
  const message = event.message || {};

  const group_id =
    event.group_id ||
    event.groupId ||
    event.raw?.from ||
    event.rawEvent?.threadId;

  if (GROUP_ID && group_id && group_id !== GROUP_ID) {
    console.log("[Webhook] Ignored group:", group_id);
    return;
  }

  if (!store.isCollecting()) return;

  const userId = sender.id || event.senderId || "unknown";
  const userName =
    sender.display_name || event.senderName || `User_${userId}`;

  const text = message.text || event.text || event.content || "";

  const attachments = message.attachments || [];

  // ───── MESSAGE STORE ─────
  if (text) {
    const msg = {
      userId,
      userName,
      text,
      timestamp: Date.now(),
    };

    store.addMessage(msg);

    console.log(`[Webhook] ${userName}: ${text}`);

    // 🚀 LIVE DASHBOARD UPDATE
    io.emit("live_message", msg);

    store.queueSubmission(userId, userName);
  }

  // ───── FILES ─────
  for (const att of attachments) {
    const fileUrl = att?.payload?.url || att?.url;

    if (fileUrl) {
      store.addFile({
        userId,
        userName,
        fileUrl,
        fileName: att?.name || "file",
        timestamp: Date.now(),
      });

      store.queueSubmission(userId, userName);
    }
  }

  scheduleProcessing(userId, userName);
});

// ─────────────────────────────────────────────
// MESSAGE BUFFER
// ─────────────────────────────────────────────
const pendingTimers = new Map();

function scheduleProcessing(userId, userName) {
  if (pendingTimers.has(userId)) {
    clearTimeout(pendingTimers.get(userId));
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(userId);
    processSubmission({ userId, userName });
  }, 7000);

  pendingTimers.set(userId, timer);
}

// ─────────────────────────────────────────────
// PROCESS SUBMISSION
// ─────────────────────────────────────────────
async function processSubmission({ userId, userName }) {
  if (store.hasSubmitted(userId)) return;

  const userMessages = store.getUserMessages(userId);
  const reportText = userMessages.map((m) => m.text).join("\n");

  const aiNotes = await analyzeReport(userName, reportText);

  await submitToGoogleForm({
    name: userName,
    userId,
    week: store.getCurrentWeek(),
    report: reportText,
    notes: aiNotes,
    fileLinks: [],
  });

  store.markSubmitted(userId, userName);

  await sendGroupMessage(`✅ ${userName} submitted successfully!`);

  io.emit("submission_update", {
    userId,
    userName,
    time: Date.now(),
  });
}

// ─────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────
async function analyzeReport(userName, reportText) {
  try {
    const prompt = `Summarize:\n${userName}\n${reportText}`;
    return await chatComplete(prompt, 200);
  } catch {
    return "AI unavailable";
  }
}

// ─────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────
let cronJob = null;

function scheduleWeeklyReport(expr) {
  if (cronJob) cronJob.stop();

  cronJob = cron.schedule(expr, sendReportRequest, {
    timezone: "Asia/Ho_Chi_Minh",
  });

  store.setSchedule(expr);
}

scheduleWeeklyReport(store.getSchedule() || "0 8 * * 1");

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    isCollecting: store.isCollecting(),
    currentWeek: store.getCurrentWeek(),
    schedule: store.getSchedule(),
    submitted: store.getSubmitted(),
    messages: store.getRecentMessages(100),
  });
});

app.post("/api/trigger", async (req, res) => {
  await sendReportRequest();
  res.json({ ok: true });
});

app.post("/api/schedule", (req, res) => {
  scheduleWeeklyReport(req.body.cron);
  res.json({ ok: true });
});

app.post("/api/close-collection", (req, res) => {
  store.stopCollection();
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`[Server] Running on ${PORT}`);
});

// ─────────────────────────────────────────────
// UTIL
// ─────────────────────────────────────────────
function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1);

  return `Week of ${start.toLocaleDateString("en-GB")}`;
}