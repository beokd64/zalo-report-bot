const express = require("express");
const { spawn } = require("child_process");

const app = express();
app.use(express.json());

const OPENCLAW_PS1 =
"C:\Users\Admin\AppData\Roaming\npm\openclaw.ps1";

const GROUP_ID = process.env.ZALO_GROUP_ID;

app.post("/send", (req, res) => {
const text = req.body.text;

if (!text) {
return res.status(400).json({
error: "Missing text",
});
}

console.log("[Bridge] Sending:", text);

const child = spawn(
"powershell.exe",
[
"-ExecutionPolicy",
"Bypass",
"-File",
OPENCLAW_PS1,
"message",
"send",
"--channel",
"zalouser",
"--target",
GROUP_ID,
"--message",
text,
],
{
shell: true,
}
);

let stdout = "";
let stderr = "";

child.stdout.on("data", (data) => {
stdout += data.toString();
});

child.stderr.on("data", (data) => {
stderr += data.toString();
});

child.on("close", (code) => {
console.log("[Bridge] Exit code:", code);

if (code !== 0) {
  console.error(stderr);

  return res.status(500).json({
    error: stderr || Process exited with code ${code},
  });
}

console.log(stdout);

return res.json({
  ok: true,
  output: stdout,
});

});
});

app.get("/", (req, res) => {
res.send("OpenClaw bridge running");
});

app.listen(5050, () => {
console.log("OpenClaw bridge running on port 5050");
});