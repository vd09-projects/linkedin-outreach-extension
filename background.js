import {
  ContentAction,
  EngineState,
  MessageType,
  OperationId,
  normalizeConnectConfig,
  validateConnectConfig
} from "./shared/messages.js";
import { getLocal } from "./shared/storage.js";
import { evaluateConnectDecision, DecisionOutcome } from "./shared/decision.js";
import { appendLogs, clearLogs, getLogs, LogEventType } from "./shared/logger.js";

const INVITE_DELAY_MS = 3500;
const NEXT_PAGE_DELAY_MS = 3500;

const state = {
  engineState: EngineState.READY,
  activeOperation: null,
  config: null,
  lastDryRunResult: null,
  shouldStop: false,
  engineContext: null,
  engineTask: null,
  invitesSentTotal: 0
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
    lastDryRunResult: state.lastDryRunResult,
    invitesSent: state.engineContext?.invitesSent ?? state.invitesSentTotal
  };
}

async function handleStart() {
  if (state.engineState === EngineState.RUNNING) {
    return { ok: true, message: "Already running.", state: buildStatus() };
  }
  const { opId, config } = await loadActiveConfig();
  if (!opId || !config) {
    return { ok: false, message: "Select an operation and configure it first." };
  }
  const tab = await getActiveTab();
  if (!tab?.id || !isLinkedInSearchUrl(tab.url)) {
    return { ok: false, message: "Active tab must be a LinkedIn People search results page." };
  }
  const injected = await ensureContentScript(tab.id);
  if (!injected) {
    return { ok: false, message: "Unable to inject content script into the active tab." };
  }

  state.activeOperation = opId;
  state.config = config;
  state.engineState = EngineState.RUNNING;
  state.shouldStop = false;
  state.invitesSentTotal = 0;
  state.engineContext = {
    tabId: tab.id,
    invitesSent: 0,
    page: 1
  };
  state.engineTask = runConnectAutomation();
  console.log("Engine started for op:", opId, config);
  return { ok: true, message: "Engine started.", state: buildStatus() };
}

function handleStop() {
  if (state.engineState === EngineState.RUNNING) {
    state.shouldStop = true;
    state.engineState = EngineState.STOPPING;
    console.log("Engine stop requested.");
    return;
  }
  if (state.engineState === EngineState.STOPPING) {
    state.shouldStop = true;
    return;
  }
  state.shouldStop = false;
  state.engineState = EngineState.STOPPED;
  console.log("Engine already idle.");
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
  if (state.engineState === EngineState.RUNNING) {
    return { ok: false, message: "Engine is running. Stop it before collecting manually." };
  }
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

async function runConnectAutomation() {
  const context = state.engineContext;
  if (!context) return;

  try {
    while (!state.shouldStop) {
      const scrapeRes = await sendActionToTab(context.tabId, {
        action: ContentAction.SCRAPE_PAGE,
        notifyBackground: false
      });
      if (!scrapeRes?.ok) {
        await logEngineEvent(scrapeRes?.reason || "scrape_failed");
        break;
      }
      const profiles = scrapeRes.profiles || [];
      if (profiles.length === 0) {
        await logEngineEvent("no_profiles_on_page");
        break;
      }

      const { opId, config } = await getActiveConfig();
      if (!config) {
        await logEngineEvent("missing_config");
        break;
      }
      const evaluated = await evaluateAndLogProfiles(
        profiles,
        LogEventType.PROFILE_EVALUATION,
        opId,
        config
      );

      const shouldContinue = await processProfilesForInvites(context, evaluated, config);
      if (!shouldContinue) break;
      if (state.shouldStop) break;

      const nextRes = await sendActionToTab(context.tabId, { action: ContentAction.NEXT_PAGE });
      if (!nextRes?.ok || !nextRes.navigated) {
        await logEngineEvent(nextRes?.reason || "next_page_failed");
        break;
      }
      context.page += 1;
      await delay(NEXT_PAGE_DELAY_MS);
    }
  } catch (err) {
    console.error("Engine loop error:", err);
    await logEngineEvent(err.message || "engine_error");
  } finally {
    state.engineTask = null;
    state.engineContext = null;
    state.shouldStop = false;
    state.engineState = EngineState.READY;
  }
}

async function processProfilesForInvites(context, evaluatedProfiles, config) {
  if (!evaluatedProfiles || evaluatedProfiles.length === 0) {
    await logEngineEvent("no_profiles_to_process");
    return false;
  }

  for (const profile of evaluatedProfiles) {
    if (state.shouldStop) return false;
    if (context.invitesSent >= config.dailyLimit) {
      await logEngineEvent("daily_limit_reached");
      state.shouldStop = true;
      return false;
    }
    if (profile.decision !== DecisionOutcome.INVITE) {
      continue;
    }

    const inviteRes = await sendInviteToProfile(context.tabId, profile, config);
    if (!inviteRes.ok) {
      await appendLogs([
        {
          eventType: LogEventType.INVITE_FAILED,
          reason: inviteRes.reason || "invite_failed",
          profile: summarizeProfile(profile)
        }
      ]);
      continue;
    }

    context.invitesSent += 1;
    state.invitesSentTotal = context.invitesSent;
    await appendLogs([
      {
        eventType: LogEventType.INVITE_SENT,
        profile: summarizeProfile(profile),
        noteUsed: inviteRes.noteUsed
      }
    ]);

    await delay(INVITE_DELAY_MS);
  }

  return true;
}

async function sendInviteToProfile(tabId, profile, config) {
  if (!profile?.profileId) {
    return { ok: false, reason: "missing_profile_id" };
  }
  const note = buildPersonalNote(config.personalNote, profile);
  const res = await sendActionToTab(tabId, {
    action: ContentAction.SEND_INVITE,
    profileId: profile.profileId,
    note,
    simulate: false
  });
  if (res?.ok) {
    return { ok: true, noteUsed: Boolean(note && note.trim()) };
  }
  return { ok: false, reason: res?.reason || "send_failed" };
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
      location: profile.location,
      profileId: profile.profileId || ""
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

function buildPersonalNote(template, profile) {
  if (!template) return "";
  const firstName = (profile?.name || "").split(/\s+/)[0] || "";
  const replacements = {
    firstName,
    fullName: profile?.name || ""
  };
  const note = template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => replacements[key] || "").trim();
  return note.slice(0, 295);
}

function summarizeProfile(profile) {
  return {
    name: profile?.name || "",
    title: profile?.title || "",
    location: profile?.location || "",
    profileId: profile?.profileId || ""
  };
}

async function logEngineEvent(message) {
  await appendLogs([
    {
      eventType: LogEventType.ENGINE_EVENT,
      message
    }
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
