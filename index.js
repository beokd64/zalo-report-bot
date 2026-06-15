require("dotenv").config();

const express = require("express");
const cron = require("node-cron");
const axios = require("axios");
const path = require("path");

const store = require("./store");
const { uploadFileFromUrl } = require("./google/drive");
const { submitToGoogleForm } = require("./google/form");
const { chatComplete } = require("./ai");

const app = express();

const GROUP_ID =
  process.env.ZALO_GROUP_ID || "group:3421414480936586205";

const OPENCLAW_BRIDGE_URL =
  process.env.OPENCLAW_BRIDGE_URL ||
  "https://giddy-jittery-starving.ngrok-free.dev";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.status(200).send("Zalo Report Bot is running");
});

app.post("/", (req, res) => {
  console.log("[Root POST]", req.body);
  res.status(200).send("OK");
});

app.get("/zalo_verifierPE6T8hdAIpri-TyPjT1B8MlRuYQ7hJTnD3Wq.html", (req, res) => {
  res.sendFile(
    path.join(
      process.cwd(),
      "zalo_verifierPE6T8hdAIpri-TyPjT1B8MlRuYQ7hJTnD3Wq.html"
    )
  );
});

app.get("/webhook", (req, res) => {
  res.status(200).send("Webhook OK");
});

app.use(express.static(path.join(__dirname, "dashboard")));

// ─── OpenClaw bridge sender ──────────────────────────────────────────────────
async function sendGroupMessage(text) {
  try {
    if (!OPENCLAW_BRIDGE_URL) {
      throw new Error("Missing OPENCLAW_BRIDGE_URL");
    }

    const res = await axios.post(`${OPENCLAW_BRIDGE_URL}/send`, {
      text,
    });

    console.log("[OpenClaw] Message sent:", res.data);
    return res.data;
  } catch (err) {
    console.error("[OpenClaw] Send error:", err.response?.data || err.message);
  }
}

async function sendReportRequest() {
  const week = getWeekLabel();

  const msg =
    `📋 Weekly Report Request – ${week}\n\n` +
    `Hi team! Please submit your project update for this week.\n\n` +
    `Reply with:\n` +
    `• Project name\n` +
    `• Progress this week\n` +
    `• Blockers / issues\n` +
    `• Plan for next week\n\n` +
    `Deadline: Friday 5 PM. You can also attach files directly here. 🚀`;

  await sendGroupMessage(msg);
  store.startCollection(week);

  console.log(`[Bot] Weekly report request sent for ${week}`);
}

// ─── Incoming webhook ────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  console.log("========== WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("=============================");

  res.sendStatus(200);

  const event = req.body;
  if (!event) return;

  const sender = event.sender || event.user || {};
  const message = event.message || {};
  const group_id =
    event.group_id ||
    event.groupId ||
    event.threadId ||
    event.group ||
    event.rawEvent?.threadId;

  if (GROUP_ID && group_id && group_id !== GROUP_ID) {
    console.log(`[Webhook] Ignored group_id: ${group_id}`);
    return;
  }

  if (!store.isCollecting()) {
    console.log("[Webhook] Ignored because collection is not active");
    return;
  }

  const userId =
    sender.id ||
    sender.userId ||
    event.senderId ||
    event.userId ||
    "unknown-user";

  const userName =
    sender.display_name ||
    sender.displayName ||
    sender.name ||
    event.senderName ||
    `User_${userId}`;

  const text =
    message.text ||
    event.text ||
    event.content ||
    event.messageText ||
    "";

  const attachments =
    message.attachments ||
    event.attachments ||
    event.metadata?.attachments ||
    event.rawEvent?.attachments ||
    [];

  if (text) {
    store.addMessage({
      userId,
      userName,
      text,
      timestamp: Date.now(),
    });

    console.log(`[Webhook] ${userName}: ${text.slice(0, 80)}`);
    store.queueSubmission(userId, userName);
  }

  for (const att of attachments) {
    const fileUrl =
      att?.payload?.url ||
      att?.url ||
      att?.downloadUrl ||
      att?.fileUrl;

    const fileName =
      att?.payload?.name ||
      att?.name ||
      att?.filename ||
      `file_${Date.now()}`;

    if (fileUrl) {
      store.addFile({
        userId,
        userName,
        fileUrl,
        fileName,
        timestamp: Date.now(),
      });

      console.log(`[Webhook] File from ${userName}: ${fileName}`);
      store.queueSubmission(userId, userName);
    }
  }

  if (!text && attachments.length === 0) {
    console.log("[Webhook] No text or attachments found");
    return;
  }

  scheduleProcessing(userId, userName);
});

const pendingTimers = new Map();

function scheduleProcessing(userId, userName) {
  if (pendingTimers.has(userId)) {
    clearTimeout(pendingTimers.get(userId));
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(userId);

    processSubmission({ userId, userName }).catch((e) =>
      console.error("[Bot] processSubmission error:", e.message)
    );
  }, 8000);

  pendingTimers.set(userId, timer);
}

// ─── Process submission ──────────────────────────────────────────────────────
async function processSubmission({ userId, userName }) {
  if (store.hasSubmitted(userId)) {
    console.log(`[Bot] ${userName} already submitted this week`);
    return;
  }

  console.log(`[Bot] Processing submission from ${userName}`);

  const userMessages = store.getUserMessages(userId);
  const reportText = userMessages
    .map((m) => m.text)
    .filter(Boolean)
    .join("\n");

  const userFiles = store.getUserFiles(userId);

  const fileLinks = [];

  for (const f of userFiles) {
    try {
      const link = await uploadFileFromUrl({
        fileUrl: f.fileUrl,
        fileName: f.fileName,
        userName,
      });

      fileLinks.push(`${f.fileName}: ${link}`);
    } catch (err) {
      console.error(`[Drive] Upload failed for ${f.fileName}:`, err.message);
    }
  }

  const aiNotes = await analyzeReport(
    userName,
    reportText,
    userMessages,
    fileLinks
  );

  const week = store.getCurrentWeek();

  try {
    await submitToGoogleForm({
      name: userName,
      userId,
      week,
      report: reportText || "(no text — files only)",
      notes: aiNotes,
      fileLinks,
    });

    console.log(`[Google Form] Submitted for ${userName}`);
  } catch (err) {
    console.error("[Google Form] Submit error:", err.message);
  }

  store.markSubmitted(userId, userName);

  await sendGroupMessage(
    `✅ Thanks ${userName}! Your weekly report has been received and submitted. 📁`
  );
}

// ─── AI analysis ─────────────────────────────────────────────────────────────
async function analyzeReport(userName, reportText, allMessages, fileLinks) {
  try {
    const context = allMessages
      .slice(-20)
      .map((m) => `${m.userName}: ${m.text}`)
      .join("\n");

    const fileList = fileLinks.length
      ? fileLinks.map((f) => `- ${f}`).join("\n")
      : "No files attached.";

    const prompt =
      `You are a project manager assistant. Analyse the weekly report below.\n\n` +
      `Member: ${userName}\n` +
      `Report text:\n${reportText || "(none)"}\n\n` +
      `Attached files:\n${fileList}\n\n` +
      `Conversation context this week:\n${context}\n\n` +
      `Write a concise 3–5 sentence summary covering:\n` +
      `1. Key accomplishments mentioned\n` +
      `2. Any blockers or concerns raised\n` +
      `3. Whether the attached files appear relevant to the report\n` +
      `4. Overall sentiment and engagement level\n` +
      `Keep it factual and professional.`;

    return await chatComplete(prompt, 400);
  } catch (err) {
    console.error("[AI] Analysis error:", err.message);
    return "AI analysis unavailable.";
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
let currentCron = null;

function scheduleWeeklyReport(cronExpression) {
  if (currentCron) currentCron.stop();

  currentCron = cron.schedule(cronExpression, sendReportRequest, {
    timezone: "Asia/Ho_Chi_Minh",
  });

  store.setSchedule(cronExpression);
  console.log(`[Scheduler] Set to: ${cronExpression}`);
}

scheduleWeeklyReport(store.getSchedule() || "0 8 * * 1");

// ─── Dashboard API ───────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    isCollecting: store.isCollecting(),
    currentWeek: store.getCurrentWeek(),
    schedule: store.getSchedule(),
    submitted: store.getSubmitted(),
    messages: store.getRecentMessages(50),
  });
});

app.post("/api/trigger", async (req, res) => {
  await sendReportRequest();
  res.json({
    ok: true,
    message: "Report request sent manually.",
  });
});

app.post("/api/schedule", (req, res) => {
  const { cron: expr } = req.body;

  if (!expr) {
    return res.status(400).json({ error: "Missing cron expression" });
  }

  try {
    scheduleWeeklyReport(expr);
    res.json({ ok: true, schedule: expr });
  } catch (e) {
    res.status(400).json({ error: "Invalid cron expression" });
  }
});

app.post("/api/close-collection", (req, res) => {
  store.stopCollection();
  res.json({ ok: true });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);

  start.setDate(now.getDate() - now.getDay() + 1);

  return `Week of ${start.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}