import { getLocal, setLocal } from "./storage.js";

const LOG_STORAGE_KEY = "outreachLogs";
const MAX_LOGS = 200;

let counter = 0;

export const LogEventType = {
  DRY_RUN_PREVIEW: "dry_run_preview",
  INVITE_SENT: "invite_sent",
  SKIPPED: "skipped",
  PROFILE_EVALUATION: "profile_evaluation"
};

export async function appendLogs(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const normalized = entries.map((entry) => normalizeEntry(entry));
  const stored = await getLocal([LOG_STORAGE_KEY]);
  const existing = stored[LOG_STORAGE_KEY] || [];
  const combined = [...normalized, ...existing];
  const trimmed = combined.slice(0, MAX_LOGS);
  await setLocal({ [LOG_STORAGE_KEY]: trimmed });
  return normalized;
}

export async function appendLog(entry) {
  const [normalized] = await appendLogs([entry]);
  return normalized;
}

export async function getLogs(limit = 20) {
  const stored = await getLocal([LOG_STORAGE_KEY]);
  const logs = stored[LOG_STORAGE_KEY] || [];
  return logs.slice(0, limit);
}

export async function clearLogs() {
  await setLocal({ [LOG_STORAGE_KEY]: [] });
}

function normalizeEntry(entry) {
  const id = entry?.id || `${Date.now()}-${counter++}`;
  const timestamp = Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now();
  return {
    id,
    timestamp,
    eventType: entry?.eventType || "unknown",
    ...entry
  };
}
