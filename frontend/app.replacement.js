const loginForm = document.getElementById("login-form");
const votingSection = document.getElementById("voting-section");
const identityCard = document.getElementById("identity-card");
const welcomeMessage = document.getElementById("welcome-message");
const sessionState = document.getElementById("session-state");
const statusMessage = document.getElementById("status-message");
const resultsList = document.getElementById("results-list");
const auditLogList = document.getElementById("audit-log-list");
const voteStatusPill = document.getElementById("vote-status-pill");
const voteConfirmation = document.getElementById("vote-confirmation");
const sessionIdDisplay = document.getElementById("session-id-display");
const resetDemoButton = document.getElementById("reset-demo-button");
const candidateButtons = Array.from(document.querySelectorAll(".candidate-button"));

let currentUser = "";
let hasVoted = false;
let displaySessionId = "";

function createSessionId() {
  const randomBlock = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${randomBlock()}-${randomBlock()}`;
}

function ensureSessionId() {
  let existingSessionId = sessionStorage.getItem("voteGuardSessionId");

  if (!existingSessionId) {
    existingSessionId = createSessionId();
    sessionStorage.setItem("voteGuardSessionId", existingSessionId);
  }

  return existingSessionId;
}

// Use browser session storage so the mock one-vote limit lasts until the tab/browser session ends.
let sessionId = ensureSessionId();

function formatTimestamp(timestamp) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));

  const [datePart, timePart] = formatted.split(", ");

  if (!datePart || !timePart) {
    return formatted;
  }

  return `${datePart} \u2013 ${timePart}`;
}

function resetUiState() {
  currentUser = "";
  hasVoted = false;
  displaySessionId = "";
  loginForm.reset();
  identityCard.classList.add("hidden");
  votingSection.classList.add("hidden");
  voteConfirmation.classList.add("hidden");
  voteConfirmation.textContent = "";
  welcomeMessage.textContent = "";
  sessionState.textContent = "";
  sessionIdDisplay.textContent = "";
  statusMessage.textContent = "";
  updateVotingState();
}

// Updates the UI to reflect whether this browser session can still vote.
function updateVotingState() {
  if (hasVoted) {
    voteStatusPill.textContent = "Vote Locked";
    sessionState.textContent = "This session has already submitted one demo vote.";
    candidateButtons.forEach((button) => {
      button.disabled = true;
    });
  } else {
    voteStatusPill.textContent = "Voting Open";
    sessionState.textContent = "This session can submit one demo vote.";
    candidateButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

// Loads the current vote totals from the backend and displays them on the page.
async function loadResults() {
  const response = await fetch("/results");
  const data = await response.json();

  resultsList.innerHTML = "";

  Object.entries(data.results).forEach(([candidate, count]) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <div class="result-line">
        <span>${candidate}</span>
        <strong>${count}</strong>
      </div>
    `;
    resultsList.appendChild(item);
  });
}

// Loads the audit log from the backend and displays recent events.
async function loadAuditLog() {
  const response = await fetch("/audit-log");
  const data = await response.json();

  auditLogList.innerHTML = "";

  if (!data.events.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No events recorded yet.";
    auditLogList.appendChild(emptyItem);
    return;
  }

  data.events.forEach((entry) => {
    const item = document.createElement("li");
    const time = formatTimestamp(entry.timestamp);

    item.innerHTML = `
      <div class="audit-event">${entry.event}</div>
      <div class="audit-details">${entry.details}</div>
      <div class="audit-time">${time}</div>
    `;

    auditLogList.appendChild(item);
  });
}

// Handles the fake login flow by sending only a username and a mock session id.
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();

  if (!username) {
    statusMessage.textContent = "Please enter a username.";
    return;
  }

  const response = await fetch("/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, sessionId })
  });

  const data = await response.json();

  if (!response.ok) {
    statusMessage.textContent = data.error || "Login failed.";
    return;
  }

  currentUser = data.username;
  hasVoted = Boolean(data.hasVoted);
  displaySessionId = sessionId;
  welcomeMessage.textContent = `Logged in as: ${currentUser}`;
  identityCard.classList.remove("hidden");
  votingSection.classList.remove("hidden");
  sessionIdDisplay.textContent = `Session ID: ${displaySessionId}`;
  statusMessage.textContent = data.message;
  voteConfirmation.classList.add("hidden");
  voteConfirmation.textContent = "";
  updateVotingState();
  await loadAuditLog();
});

// Submits a vote for the selected candidate button and refreshes the UI.
async function submitVote(candidate) {
  if (hasVoted) {
    statusMessage.textContent = "You have already voted in this session.";
    await loadAuditLog();
    return;
  }

  const response = await fetch("/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: currentUser,
      sessionId,
      candidate
    })
  });

  const data = await response.json();

  if (!response.ok) {
    statusMessage.textContent = data.error || "Vote submission failed.";
    voteConfirmation.classList.add("hidden");
    await loadAuditLog();
    return;
  }

  hasVoted = Boolean(data.hasVoted);
  statusMessage.textContent = `Vote submitted successfully for ${candidate}.`;
  voteConfirmation.textContent = `Vote submitted for ${candidate}. Further voting is disabled for this session.`;
  voteConfirmation.classList.remove("hidden");
  updateVotingState();
  await loadResults();
  await loadAuditLog();
}

async function resetDemo() {
  const response = await fetch("/reset", {
    method: "POST"
  });

  const data = await response.json();

  if (!response.ok) {
    statusMessage.textContent = data.error || "Reset failed.";
    return;
  }

  sessionStorage.removeItem("voteGuardSessionId");
  sessionId = ensureSessionId();
  resetUiState();
  await loadResults();
  await loadAuditLog();
  statusMessage.textContent = data.message;
}

candidateButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!currentUser) {
      statusMessage.textContent = "Please log in before voting.";
      return;
    }

    await submitVote(button.dataset.candidate);
  });
});

resetDemoButton.addEventListener("click", async () => {
  await resetDemo();
});

// Populate the results and audit sections when the page first loads.
Promise.all([loadResults(), loadAuditLog()]).catch(() => {
  statusMessage.textContent = "Could not load results. Start the backend server first.";
});
