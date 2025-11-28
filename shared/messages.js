// Message types exchanged between popup/options/background/content.
export const MessageType = {
  ENGINE_STATUS: "ENGINE_STATUS", // background -> UI
  ENGINE_START: "ENGINE_START",   // UI -> background
  ENGINE_STOP: "ENGINE_STOP",     // UI -> background
  ENGINE_DRY_RUN: "ENGINE_DRY_RUN", // UI -> background
  CONTENT_PROFILE_BATCH: "CONTENT_PROFILE_BATCH", // content -> background
  BACKGROUND_ACTION_REQUEST: "BACKGROUND_ACTION_REQUEST", // background -> content
  ENGINE_COLLECT_ACTIVE_TAB: "ENGINE_COLLECT_ACTIVE_TAB",
  LOGS_FETCH: "LOGS_FETCH",
  LOGS_CLEAR: "LOGS_CLEAR"
};

// Engine lifecycle states.
export const EngineState = {
  READY: "READY",
  RUNNING: "RUNNING",
  STOPPED: "STOPPED",
  STOPPING: "STOPPING",
  DRY_RUN: "DRY_RUN"
};

// Operation identifiers.
export const OperationId = {
  CONNECT: "connect"
};

// Actions the background can request the content script to perform.
export const ContentAction = {
  SCRAPE_PAGE: "SCRAPE_PAGE",
  SEND_INVITE: "SEND_INVITE",
  NEXT_PAGE: "NEXT_PAGE"
};

// Minimal config shape used by the engine for the connect operation.
export function normalizeConnectConfig(raw) {
  if (!raw) return null;
  const minMutual = Number(raw.minMutualConnections);
  const dailyLimit = Number(raw.dailyLimit);
  return {
    jobTitleKeyword: raw.jobTitleKeyword?.trim() || "",
    locationKeyword: raw.locationKeyword?.trim() || "",
    minMutualConnections: Number.isFinite(minMutual) ? minMutual : 0,
    dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : null,
    personalNote: raw.personalNote ?? ""
  };
}

export function validateConnectConfig(config) {
  if (!config) return { ok: false, message: "Missing config." };
  if (!config.jobTitleKeyword) return { ok: false, message: "Job title is required." };
  if (!Number.isFinite(config.dailyLimit) || config.dailyLimit < 1)
    return { ok: false, message: "Daily limit must be at least 1." };
  if (config.minMutualConnections < 0)
    return { ok: false, message: "Mutual connections cannot be negative." };
  return { ok: true, message: "" };
}

// Example profile payload used by the decision engine and logger.
export function buildProfileFeatureShape(raw) {
  return {
    name: raw?.name ?? "",
    title: raw?.title ?? "",
    location: raw?.location ?? "",
    mutualConnections: Number.isFinite(raw?.mutualConnections) ? raw.mutualConnections : 0,
    hasConnectButton: Boolean(raw?.hasConnectButton)
  };
}
