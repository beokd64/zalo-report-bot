const express = require("express");
const { spawn } = require("child_process");
const axios = require("axios");
const app = express();
app.use(express.json());

const GROUP_ID = process.env.ZALO_GROUP_ID;

// IMPORTANT: use your real OpenClaw command here
function sendToZalo(text) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `openclaw message send --channel zalouser --target ${GROUP_ID} --message "${text}"`
    ]);

    let output = "";
    let error = "";

    child.stdout.on("data", d => output += d.toString());
    child.stderr.on("data", d => error += d.toString());

    child.on("close", code => {
      if (code !== 0) return reject(error);
      resolve(output);
    });
  });
}
const RAILWAY_WEBHOOK =
  "https://zalo-report-bot-production.up.railway.app/webhook";

app.post("/incoming", async (req, res) => {
  try {
    console.log("[Incoming from OpenClaw]", JSON.stringify(req.body, null, 2));

    await axios.post(RAILWAY_WEBHOOK, req.body);

    res.status(200).send("OK");
  } catch (err) {
    console.error("[Forward to Railway failed]", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/send", async (req, res) => {
  try {
    const { text } = req.body;
    const result = await sendToZalo(text);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.listen(5050, () => {
  console.log("OpenClaw bridge running on http://localhost:5050");
});