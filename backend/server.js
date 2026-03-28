const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

// These are fake candidates for the demo ballot.
const candidates = ["Alex Carter", "Jordan Lee", "Taylor Morgan"];

// This object stores vote counts only while the server is running.
const voteCounts = Object.fromEntries(candidates.map((name) => [name, 0]));

// Track whether a mock browser session has already voted.
const votedSessions = new Set();
const sessionExpirations = new Map();
const sessionUsers = new Map();

// Keep a small in-memory audit trail for the showcase.
const auditLog = [];

// Helper to add timestamped events to the audit log.
function recordAuditEvent(event, details) {
  auditLog.unshift({
    timestamp: new Date().toISOString(),
    event,
    details
  });

  // Keep the log short and readable for the demo UI.
  if (auditLog.length > 25) {
    auditLog.pop();
  }
}

function resetDemoState() {
  candidates.forEach((candidate) => {
    voteCounts[candidate] = 0;
  });

  votedSessions.clear();
  sessionExpirations.clear();
  sessionUsers.clear();
  auditLog.length = 0;
}

function validateUsername(username) {
  if (!username) {
    return "Username is required.";
  }

  if (username.length > 20) {
    return "Username must be 20 characters or fewer.";
  }

  if (!/^[A-Za-z0-9 _-]+$/.test(username)) {
    return "Username can use letters, numbers, spaces, hyphens, and underscores only.";
  }

  return null;
}

function isSessionExpired(sessionId) {
  const expiresAt = sessionExpirations.get(sessionId);

  return !expiresAt || Date.now() > expiresAt;
}

function clearSession(sessionId) {
  sessionExpirations.delete(sessionId);
  sessionUsers.delete(sessionId);
}

app.use(express.json());

// Serve the frontend files from the frontend folder.
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Mock login endpoint. It accepts any non-empty username and session id.
app.post("/login", (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const sessionId = typeof req.body.sessionId === "string" ? req.body.sessionId.trim() : "";

  if (!sessionId) {
    recordAuditEvent("Invalid login attempt", "A login attempt was made without a session id.");
    return res.status(400).json({ error: "Session id is required." });
  }

  const usernameError = validateUsername(username);

  if (usernameError) {
    recordAuditEvent("Invalid login attempt", `Rejected username "${username || "empty"}".`);
    return res.status(400).json({ error: usernameError });
  }

  sessionExpirations.set(sessionId, Date.now() + SESSION_TIMEOUT_MS);
  sessionUsers.set(sessionId, username);
  recordAuditEvent("User logged in", `${username} started a mock session.`);

  return res.json({
    message: `Logged in as: ${username}`,
    username,
    hasVoted: votedSessions.has(sessionId),
    expiresInMs: SESSION_TIMEOUT_MS
  });
});

// Vote endpoint. It increments the selected candidate count in memory
// and blocks additional votes from the same mock browser session.
app.post("/vote", (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "Anonymous";
  const candidate = req.body.candidate;
  const sessionId = typeof req.body.sessionId === "string" ? req.body.sessionId.trim() : "";

  if (!sessionId) {
    return res.status(400).json({ error: "Session id is required." });
  }

  if (isSessionExpired(sessionId)) {
    const expiredUsername = sessionUsers.get(sessionId) || username;
    clearSession(sessionId);
    recordAuditEvent("session_expired", `${expiredUsername} tried to use an expired session.`);

    return res.status(403).json({
      error: "Session expired. Please start a new session."
    });
  }

  if (!candidates.includes(candidate)) {
    return res.status(400).json({ error: "Invalid candidate selected." });
  }

  if (votedSessions.has(sessionId)) {
    recordAuditEvent("Duplicate vote attempt blocked", `${username} attempted to vote more than once.`);

    return res.status(403).json({
      error: "You have already voted in this session."
    });
  }

  voteCounts[candidate] += 1;
  votedSessions.add(sessionId);
  recordAuditEvent("Vote submitted", `${username} voted for ${candidate}.`);

  return res.json({
    message: `Vote submitted for ${candidate}.`,
    results: voteCounts,
    hasVoted: true
  });
});

// Results endpoint. It returns the current in-memory counts.
app.get("/results", (_req, res) => {
  return res.json({
    results: voteCounts
  });
});

// Audit log endpoint. It returns recent mock security-relevant events.
app.get("/audit-log", (_req, res) => {
  return res.json({
    events: auditLog
  });
});

// Session-expired endpoint. It records timeouts reported by the frontend timer.
app.post("/session-expired", (req, res) => {
  const sessionId = typeof req.body.sessionId === "string" ? req.body.sessionId.trim() : "";

  if (!sessionId) {
    return res.status(400).json({ error: "Session id is required." });
  }

  const username = sessionUsers.get(sessionId) || "Unknown user";

  if (sessionExpirations.has(sessionId)) {
    recordAuditEvent("session_expired", `${username}'s demo session expired.`);
  }

  clearSession(sessionId);

  return res.json({
    message: "Session marked as expired."
  });
});

// Reset endpoint. It restores the demo to a clean initial state.
app.post("/reset", (_req, res) => {
  resetDemoState();

  return res.json({
    message: "Demo reset complete."
  });
});

// Send the frontend entry page for the root route.
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`VoteGuard Prototype server running at http://localhost:${PORT}`);
});
