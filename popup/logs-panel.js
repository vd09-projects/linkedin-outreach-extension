import { MessageType } from "../shared/messages.js";

const refreshBtn = document.getElementById("refreshLogs");
const clearBtn = document.getElementById("clearLogs");
const logsOutput = document.getElementById("logsOutput");

document.addEventListener("DOMContentLoaded", initLogsPanel);

function initLogsPanel() {
  if (!refreshBtn || !logsOutput) return;
  refreshBtn.addEventListener("click", fetchLogs);
  clearBtn?.addEventListener("click", clearLogs);
  fetchLogs();
}

async function fetchLogs() {
  setOutput("Loading logs...");
  const res = await sendMessage({
    type: MessageType.LOGS_FETCH,
    payload: { limit: 20 }
  });
  if (!res?.ok) {
    setOutput(res?.message || "Failed to load logs.");
    return;
  }
  renderLogs(res.logs || []);
}

async function clearLogs() {
  setOutput("Clearing logs...");
  const res = await sendMessage({ type: MessageType.LOGS_CLEAR });
  if (!res?.ok) {
    setOutput(res?.message || "Failed to clear logs.");
    return;
  }
  setOutput("Logs cleared.");
  fetchLogs();
}

function renderLogs(logs) {
  if (!logs.length) {
    setOutput("No recent events.");
    return;
  }
  const lines = logs.map((log) => formatLogLine(log));
  logsOutput.textContent = lines.join("\n");
}

function formatLogLine(log) {
  const time = new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const profileName = log.profile?.name || "";
  const parts = [];
  if (profileName) parts.push(profileName);
  if (log.decision) parts.push(`decision:${log.decision}`);
  if (log.reason) parts.push(`reason:${log.reason}`);
  if (log.reasonCode) parts.push(`code:${log.reasonCode}`);
  if (typeof log.noteUsed === "boolean") parts.push(`note:${log.noteUsed ? "with" : "none"}`);
  if (log.message) parts.push(log.message);
  return `${time} — ${log.eventType}${parts.length ? " — " + parts.join(" ") : ""}`;
}

function setOutput(text) {
  logsOutput.textContent = text || "";
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Logs panel message error:", chrome.runtime.lastError.message);
        resolve({ ok: false, message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}
