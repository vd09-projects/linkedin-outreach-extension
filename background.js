import {
  EngineState,
  MessageType,
  OperationId,
  normalizeConnectConfig,
  validateConnectConfig
} from "./shared/messages.js";
import { getLocal } from "./shared/storage.js";

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
      hasConnectButton: true,
      decision: "invite",
      reason: "success"
    },
    {
      name: "Jamie Lee",
      title: "Product Manager",
      location: "New York",
      mutualConnections: 1,
      hasConnectButton: false,
      decision: "skip",
      reason: "no_connect_button"
    }
  ];

  state.lastDryRunResult = {
    timestamp: Date.now(),
    opId,
    config,
    profiles: sampleProfiles
  };

  console.log("Dry run completed with sample data.");
  return { ok: true, message: "Dry run complete.", result: state.lastDryRunResult };
}
