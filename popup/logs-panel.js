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
  const profileName = log.profile?.name || "Unknown";
  const decision = log.decision ? `decision:${log.decision}` : "";
  const reason = log.reason ? `reason:${log.reason}` : "";
  return `${time} — ${log.eventType} — ${profileName} ${decision} ${reason}`.trim();
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
