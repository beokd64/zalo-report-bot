const path = require("path");

// Always load .env from the same folder as this file
require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const express = require("express");
const { spawn } = require("child_process");
const axios = require("axios");

const app = express();
app.use(express.json());

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const GROUP_ID =
  process.env.ZALO_GROUP_ID || "group:3421414480936586205";

const RAILWAY_WEBHOOK =
  process.env.RAILWAY_WEBHOOK ||
  "https://zalo-report-bot-production.up.railway.app/webhook";

console.log("========================================");
console.log("OpenClaw Bridge Starting");
console.log("Working directory:", process.cwd());
console.log("Bridge file:", __filename);
console.log("Loaded GROUP_ID:", GROUP_ID);
console.log("Railway webhook:", RAILWAY_WEBHOOK);
console.log("========================================");

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

app.use((req, res, next) => {
  console.log(`[Bridge] ${req.method} ${req.url}`);
  next();
});

// -----------------------------------------------------------------------------
// Health
// -----------------------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "OpenClaw Bridge",
    group: GROUP_ID,
  });
});

// -----------------------------------------------------------------------------
// Send message to Zalo through OpenClaw CLI
// -----------------------------------------------------------------------------

function sendToZalo(text) {
  return new Promise((resolve, reject) => {
    const cmd =
      `openclaw message send ` +
      `--channel zalouser ` +
      `--target "${GROUP_ID}" ` +
      `--message "${text.replace(/"/g, '\\"')}"`;

    console.log("[Bridge] Executing:");
    console.log(cmd);

    const child = spawn(
      "powershell.exe",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        cmd,
      ],
      {
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      console.log("[Bridge] Exit code:", code);

      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      if (code !== 0) {
        return reject(
          new Error(stderr || stdout || `Process exited with ${code}`)
        );
      }

      resolve(stdout);
    });

    child.on("error", reject);
  });
}

// -----------------------------------------------------------------------------
// Receive events from OpenClaw plugin
// -----------------------------------------------------------------------------

app.post("/incoming", async (req, res) => {
  try {
    console.log(
      "[Incoming]",
      JSON.stringify(req.body, null, 2)
    );

    await axios.post(RAILWAY_WEBHOOK, req.body);

    res.json({
      ok: true,
    });
  } catch (err) {
    console.error(
      "[Forward Error]",
      err.response?.data || err.message
    );

    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

// -----------------------------------------------------------------------------
// Railway calls this endpoint to send messages
// -----------------------------------------------------------------------------

app.post("/send", async (req, res) => {
  try {
    console.log("[Bridge] Body:", req.body);

    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Missing text",
      });
    }

    const result = await sendToZalo(text);

    res.json({
      ok: true,
      result,
    });
  } catch (err) {
    console.error("[Bridge Error]");
    console.error(err);

    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

const PORT = process.env.BRIDGE_PORT || 5050;

app.listen(PORT, () => {
  console.log(
    `OpenClaw bridge running on http://localhost:${PORT}`
  );
});