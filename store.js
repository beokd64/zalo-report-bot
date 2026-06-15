const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "state.json");

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function save(state) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

let state = {
  collecting: false,
  currentWeek: null,
  schedule: "0 8 * * 1",
  submitted: {},      // { userId: { userName, submittedAt } }
  pending: {},        // { userId: { userName, queuedAt } } - replied, AI processing
  messages: [],       // [ { userId, userName, text, timestamp } ]
  files: [],
  ...load(),
};

module.exports = {
  isCollecting: () => state.collecting,
  getCurrentWeek: () => state.currentWeek,
  getSchedule: () => state.schedule,
  getSubmitted: () => state.submitted,
  getPending: () => state.pending,
  hasSubmitted: (userId) => !!state.submitted[userId],
  getRecentMessages: (n = 50) => state.messages.slice(-n),

  startCollection(week) {
    state.collecting = true;
    state.currentWeek = week;
    state.submitted = {};
    state.pending = {};
    state.messages = [];
    state.files = [];
    save(state);
  },

  stopCollection() {
    state.collecting = false;
    save(state);
  },

  setSchedule(expr) {
    state.schedule = expr;
    save(state);
  },

  addMessage({ userId, userName, text, timestamp }) {
    state.messages.push({ userId, userName, text, timestamp });
    // Keep last 500 messages
    if (state.messages.length > 500) state.messages = state.messages.slice(-500);
    save(state);
  },

  addFile(file) {
    state.files.push(file);
    save(state);
  },

  getUserMessages(userId) {
    return state.messages.filter((m) => m.userId === userId);
  },

  markSubmitted(userId, userName) {
    state.submitted[userId] = { userName, submittedAt: new Date().toISOString() };
    delete state.pending[userId];
    save(state);
  },

  queueSubmission(userId, userName) {
    if (!state.submitted[userId]) {
      state.pending[userId] = { userName, queuedAt: new Date().toISOString() };
      save(state);
    }
  },

  getUserFiles(userId) {
    return state.files.filter((f) => f.userId === userId);
  },
};
