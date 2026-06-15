const axios = require("axios");

// MiniMax exposes an OpenAI-compatible Chat Completions endpoint.
// Default global endpoint: https://api.minimax.io
// CN endpoint (if your OpenClaw setup uses it): https://api.minimaxi.com
const MINIMAX_HOST = process.env.MINIMAX_API_HOST || "https://api.minimax.io";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2";

async function chatComplete(prompt, maxTokens = 400) {
  const res = await axios.post(
    `${MINIMAX_HOST}/v1/chat/completions`,
    {
      model: MINIMAX_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return res.data.choices[0].message.content;
}

module.exports = { chatComplete };
