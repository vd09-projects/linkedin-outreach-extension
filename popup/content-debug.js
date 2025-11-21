import { ContentAction, MessageType } from "../shared/messages.js";

const scrapeBtn = document.getElementById("scrapeBtn");
const inviteBtn = document.getElementById("inviteBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const noteInput = document.getElementById("noteInput");
const debugOutput = document.getElementById("debugOutput");

let lastProfiles = [];

document.addEventListener("DOMContentLoaded", () => {
  if (!scrapeBtn) return;
  scrapeBtn.addEventListener("click", scrapePage);
  inviteBtn.addEventListener("click", sendInvite);
  nextPageBtn.addEventListener("click", navigateNext);
});

async function scrapePage() {
  setOutput("Scraping current page...");
  const res = await sendToActiveTab({
    type: MessageType.BACKGROUND_ACTION_REQUEST,
    payload: { action: ContentAction.SCRAPE_PAGE }
  });
  if (!res?.ok) {
    setOutput(res?.message || `Failed to scrape (${res?.reason || "unknown"}).`);
    return;
  }
  lastProfiles = res?.profiles || [];
  const lines = [];
  lines.push(`Found ${lastProfiles.length} profiles.`);
  lastProfiles.slice(0, 5).forEach((p, idx) => {
    lines.push(`${idx + 1}. ${p.name} — ${p.title} — connect:${p.hasConnectButton}`);
  });
  setOutput(lines.join("\n"));
}

async function sendInvite() {
  if (lastProfiles.length === 0) {
    setOutput("Scrape first to get a profile id.");
    return;
  }
  const target = lastProfiles[0];
  setOutput(`Simulating invite to ${target.name}...`);
  const res = await sendToActiveTab({
    type: MessageType.BACKGROUND_ACTION_REQUEST,
    payload: {
      action: ContentAction.SEND_INVITE,
      profileId: target.profileId,
      note: noteInput?.value || "",
      simulate: true
    }
  });
  setOutput(res?.ok ? `Invite result: ${JSON.stringify(res)}` : res?.message || "Invite failed.");
}

async function navigateNext() {
  setOutput("Clicking next page...");
  const res = await sendToActiveTab({
    type: MessageType.BACKGROUND_ACTION_REQUEST,
    payload: { action: ContentAction.NEXT_PAGE }
  });
  setOutput(res?.ok ? `Next page result: ${JSON.stringify(res)}` : res?.message || "Next page failed.");
}

function setOutput(text) {
  debugOutput.textContent = text || "";
}

function sendToActiveTab(message) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id) {
        resolve({ ok: false, reason: "no_active_tab", message: "No active tab found." });
        return;
      }
      if (!isLinkedInUrl(tab.url)) {
        resolve({
          ok: false,
          reason: "wrong_url",
          message: "Open a LinkedIn People search results page, then try again."
        });
        return;
      }
      trySend(tab.id, false);
    });

    async function trySend(tabId, injected) {
      chrome.tabs.sendMessage(tabId, message, async (response) => {
        if (chrome.runtime.lastError) {
          if (!injected) {
            const loaded = await ensureContentScript(tabId);
            if (loaded) {
              trySend(tabId, true);
              return;
            }
          }
          resolve({
            ok: false,
            reason: "no_content_script",
            message:
              chrome.runtime.lastError?.message ||
              "Content script not running. Refresh the LinkedIn results page and try again."
          });
          return;
        }
        resolve(response);
      });
    }
  });
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

function isLinkedInUrl(url) {
  return typeof url === "string" && url.startsWith("https://www.linkedin.com/");
}
