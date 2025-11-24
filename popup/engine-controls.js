import { MessageType } from "../shared/messages.js";

const dryRunBtn = document.getElementById("dryRunBtn");
const collectBtn = document.getElementById("collectProfilesBtn");
const statusEl = document.getElementById("engineStatus");
const dryRunResultEl = document.getElementById("dryRunResult");

document.addEventListener("DOMContentLoaded", initEngineControls);

async function initEngineControls() {
  if (!dryRunBtn) return;
  dryRunBtn.addEventListener("click", runDryRun);
  collectBtn?.addEventListener("click", collectProfiles);
  const status = await requestStatus();
  if (!status) {
    setStatus("Background unavailable.");
    return;
  }
  renderStatus(status);
}

async function runDryRun() {
  setStatus("Running dry run...");
  const res = await sendMessage({ type: MessageType.ENGINE_DRY_RUN });
  if (!res) {
    setStatus("Background unavailable.");
    dryRunResultEl.textContent = "";
    return;
  }
  if (!res.ok) {
    setStatus(res?.message || "Dry run failed.");
    dryRunResultEl.textContent = "";
    return;
  }
  setStatus(res.message || "Dry run complete.");
  renderDryRun(res.result);
}

async function collectProfiles() {
  setStatus("Collecting profiles...");
  const res = await sendMessage({ type: MessageType.ENGINE_COLLECT_ACTIVE_TAB });
  if (!res) {
    setStatus("Background unavailable.");
    return;
  }
  if (!res.ok) {
    setStatus(res.message || "Collection failed.");
    return;
  }
  setStatus(res.message || "Profiles collected.");
  renderDryRun(res.result);
}

function renderStatus(status) {
  if (status?.state) {
    statusEl.textContent = `Engine: ${status.state}`;
  }
}

function renderDryRun(result) {
  if (!result) {
    dryRunResultEl.textContent = "";
    return;
  }
  const lines = [];
  lines.push(`Operation: ${result.opId}`);
  lines.push(`Profiles previewed: ${result.profiles?.length || 0}`);
  (result.profiles || []).forEach((p, idx) => {
    lines.push(`${idx + 1}. ${p.name} — ${p.title} — decision: ${p.decision} (${p.reason})`);
  });
  dryRunResultEl.textContent = lines.join("\n");
}

async function requestStatus() {
  return sendMessage({ type: MessageType.ENGINE_STATUS });
}

function setStatus(text) {
  statusEl.textContent = text;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Engine message error:", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      console.warn("Engine message exception:", err);
      resolve(null);
    }
  });
}
