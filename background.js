import {
  ContentAction,
  EngineState,
  MessageType,
  OperationId,
  normalizeConnectConfig,
  validateConnectConfig
} from "./shared/messages.js";
import { getLocal } from "./shared/storage.js";
import { evaluateConnectDecision } from "./shared/decision.js";
import { appendLogs, clearLogs, getLogs, LogEventType } from "./shared/logger.js";

const state = {
  engineState: EngineState.READY,
  activeOperation: null,
  config: null,
  lastDryRunResult: null
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("LinkedIn Outreach Automation extension installed.");
});

chrome.runtime.onStartup.addListener(() => {
  console.log("LinkedIn Outreach Automation extension started.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;

  switch (message.type) {
    case MessageType.ENGINE_STATUS:
      sendResponse(buildStatus());
      break;
    case MessageType.ENGINE_START:
      handleStart(message.payload)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, message: err.message || "Start failed." }));
      return true; // async
    case MessageType.ENGINE_STOP:
      handleStop();
      sendResponse({ ok: true, message: "Stopped." });
      break;
    case MessageType.ENGINE_DRY_RUN:
      handleDryRun()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, message: err.message || "Dry run failed." }));
      return true; // async
    case MessageType.ENGINE_COLLECT_ACTIVE_TAB:
      handleCollectActiveTab()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, message: err.message || "Collect failed." }));
      return true; // async
    case MessageType.LOGS_FETCH:
      handleFetchLogs(message.payload)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, message: err.message || "Log fetch failed." }));
      return true; // async
    case MessageType.LOGS_CLEAR:
      handleClearLogs()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, message: err.message || "Log clear failed." }));
      return true; // async
    case MessageType.CONTENT_PROFILE_BATCH:
      handleProfileBatch(message.payload, sender)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, message: err.message || "Batch failed." }));
      return true; // async
    default:
      break;
  }
});

async function loadActiveConfig() {
  const stored = await getLocal(["operationConfigs", "selectedOperation"]);
  const opId = stored.selectedOperation;
  const configs = stored.operationConfigs || {};
  const rawConfig = opId ? configs[opId] : null;
  if (!opId) return { opId: null, config: null };
  if (opId === OperationId.CONNECT) {
    const normalized = normalizeConnectConfig(rawConfig);
    const validation = validateConnectConfig(normalized);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
    return { opId, config: normalized };
  }
  throw new Error("Unsupported operation.");
}

function buildStatus() {
  return {
    state: state.engineState,
    activeOperation: state.activeOperation,
    lastDryRunResult: state.lastDryRunResult
  };
}

async function handleStart() {
  if (state.engineState === EngineState.RUNNING) {
    return { ok: true, message: "Already running." };
  }
  const { opId, config } = await loadActiveConfig();
  state.activeOperation = opId;
  state.config = config;
  state.engineState = EngineState.RUNNING;
  console.log("Engine started for op:", opId, config);
  return { ok: true, message: "Engine started.", state: buildStatus() };
}

function handleStop() {
  state.engineState = EngineState.STOPPED;
  console.log("Engine stopped.");
}

async function handleDryRun() {
  const { opId, config } = await loadActiveConfig();
  state.activeOperation = opId;
  state.config = config;
  state.engineState = EngineState.DRY_RUN;

  // Simulated dry-run result; in future, request content script for preview batch.
  const sampleProfiles = [
    {
      name: "Alex Smith",
      title: "Senior Software Engineer at ExampleCorp",
      location: "San Francisco Bay Area",
      mutualConnections: 12,
      hasConnectButton: true
    },
    {
      name: "Jamie Lee",
      title: "Product Manager",
      location: "New York",
      mutualConnections: 1,
      hasConnectButton: false
    }
  ];

  const evaluatedProfiles = await evaluateAndLogProfiles(
    sampleProfiles,
    LogEventType.DRY_RUN_PREVIEW,
    opId,
    config
  );

  state.lastDryRunResult = {
    timestamp: Date.now(),
    opId,
    config,
    profiles: evaluatedProfiles
  };

  console.log("Dry run completed with sample data.");
  return { ok: true, message: "Dry run complete.", result: state.lastDryRunResult };
}

async function handleFetchLogs(payload) {
  const limit = payload?.limit ?? 20;
  const logs = await getLogs(limit);
  return { ok: true, logs };
}

async function handleClearLogs() {
  await clearLogs();
  return { ok: true };
}

async function handleProfileBatch(payload) {
  const profiles = payload?.profiles || [];
  if (profiles.length === 0) {
    return { ok: false, message: "Batch contained no profiles." };
  }
  const { opId, config } = await getActiveConfig();
  if (!config) {
    return { ok: false, message: "No active config available." };
  }
  const evaluatedProfiles = await evaluateAndLogProfiles(
    profiles,
    LogEventType.PROFILE_EVALUATION,
    opId,
    config
  );
  return { ok: true, profiles: evaluatedProfiles };
}

async function handleCollectActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, message: "No active tab." };
  }
  if (!isLinkedInSearchUrl(tab.url)) {
    return { ok: false, message: "Active tab must be LinkedIn People search results." };
  }
  const injected = await ensureContentScript(tab.id);
  if (!injected) {
    return { ok: false, message: "Unable to inject content script." };
  }
  const scrapeRes = await sendActionToTab(tab.id, {
    action: ContentAction.SCRAPE_PAGE,
    notifyBackground: false
  });
  if (!scrapeRes?.ok) {
    return { ok: false, message: scrapeRes?.reason || "Scrape failed." };
  }
  const { opId, config } = await getActiveConfig();
  if (!config) {
    return { ok: false, message: "No active config available." };
  }
  state.activeOperation = opId;
  state.config = config;
  state.engineState = EngineState.RUNNING;
  const evaluatedProfiles = await evaluateAndLogProfiles(
    scrapeRes.profiles || [],
    LogEventType.PROFILE_EVALUATION,
    opId,
    config
  );
  const result = {
    timestamp: Date.now(),
    opId,
    config,
    profiles: evaluatedProfiles
  };
  state.lastDryRunResult = result;
  state.engineState = EngineState.READY;
  return { ok: true, message: `Collected ${evaluatedProfiles.length} profiles.`, result };
}

async function evaluateAndLogProfiles(profiles, eventType, opId, config) {
  if (!profiles || profiles.length === 0) return [];
  const evaluated = profiles.map((profile) => ({
    ...profile,
    ...evaluateConnectDecision(profile, config)
  }));
  await appendLogs(buildLogEntries(evaluated, eventType, opId));
  return evaluated;
}

function buildLogEntries(evaluatedProfiles, eventType, opId) {
  return evaluatedProfiles.map((profile) => ({
    eventType,
    opId,
    decision: profile.decision,
    reason: profile.reason,
    profile: {
      name: profile.name,
      title: profile.title,
      location: profile.location
    }
  }));
}

async function getActiveConfig() {
  if (state.activeOperation && state.config) {
    return { opId: state.activeOperation, config: state.config };
  }
  return loadActiveConfig();
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0] || null);
    });
  });
}

function isLinkedInSearchUrl(url) {
  if (!url) return false;
  return url.startsWith("https://www.linkedin.com/search/results/people");
}

function ensureContentScript(tabId) {
  return new Promise((resolve) => {
    if (!chrome.scripting?.executeScript) {
      resolve(false);
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["content/dom-adapter.js"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to inject content script:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}

function sendActionToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: MessageType.BACKGROUND_ACTION_REQUEST,
        payload
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Tab messaging error:", chrome.runtime.lastError.message);
          resolve({ ok: false, reason: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      }
    );
  });
}
