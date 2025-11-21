// Content script for LinkedIn People search pages.
// Handles profile extraction and invitation flow. Designed to be message-driven
// so the background engine can orchestrate actions and pagination safely.

const MessageType = {
  BACKGROUND_ACTION_REQUEST: "BACKGROUND_ACTION_REQUEST"
};

const ContentAction = {
  SCRAPE_PAGE: "SCRAPE_PAGE",
  SEND_INVITE: "SEND_INVITE",
  NEXT_PAGE: "NEXT_PAGE"
};

const DEFAULT_TIMEOUT_MS = 6000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type || message.type !== MessageType.BACKGROUND_ACTION_REQUEST) return;
  const action = message.payload?.action;
  if (!action) return;

  switch (action) {
    case ContentAction.SCRAPE_PAGE:
      sendResponse(scrapePage());
      break;
    case ContentAction.SEND_INVITE:
      handleSendInvite(message.payload)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, reason: err.message || "invite_failed" }));
      return true; // async
    case ContentAction.NEXT_PAGE:
      handleNextPage()
        .then((res) => sendResponse(res))
        .catch((err) =>
          sendResponse({ ok: false, reason: err.message || "next_page_failed", navigated: false })
        );
      return true; // async
    default:
      break;
  }
});

function scrapePage() {
  const cards = getProfileCards();
  const profiles = cards.map((card, idx) => extractProfile(card, idx)).filter(Boolean);
  return { ok: true, profiles, count: profiles.length };
}

function getProfileCards() {
  const selectors = [
    "ul.reusable-search__entity-result-list li.reusable-search__result-container",
    "li.reusable-search__result-container",
    "div.search-results-container li.artdeco-list__item",
    "div.reusable-search__result-container",
    "div.search-result__info"
  ];

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length > 0) return nodes;
  }

  const modernNodes = getModernProfileContainers();
  if (modernNodes.length > 0) return modernNodes;

  return [];
}

function getModernProfileContainers() {
  const seen = new Set();
  const cards = [];
  const nameLinks = document.querySelectorAll("a[data-view-name='search-result-lockup-title']");
  nameLinks.forEach((link) => {
    const infoWrapper = link.closest("p")?.parentElement;
    const card = infoWrapper?.parentElement;
    if (card && !seen.has(card)) {
      seen.add(card);
      cards.push(card);
    }
  });
  return cards;
}

function extractProfile(cardEl, index) {
  if (!cardEl) return null;
  if (!cardEl.dataset.outreachId) {
    cardEl.dataset.outreachId = `outreach-${Date.now()}-${index}`;
  }
  const profileId = cardEl.dataset.outreachId;

  const modernInfo = extractModernCardInfo(cardEl);

  const name =
    cardEl.querySelector("span.entity-result__title-text a span[dir='ltr']")?.textContent?.trim() ||
    cardEl.querySelector("span[dir='ltr']")?.textContent?.trim() ||
    modernInfo?.name ||
    cardEl.querySelector("a[data-view-name='search-result-lockup-title']")?.textContent?.trim() ||
    "";

  const title =
    cardEl.querySelector("div.entity-result__primary-subtitle")?.textContent?.trim() ||
    textContentFrom(
      cardEl.querySelector("div.entity-result__primary-subtitle.t-14"),
      cardEl.querySelector("div.t-black--light")
    ) ||
    modernInfo?.title ||
    "";

  const location =
    cardEl.querySelector("div.entity-result__secondary-subtitle")?.textContent?.trim() ||
    textContentFrom(cardEl.querySelector("div.t-12")) ||
    modernInfo?.location ||
    "";

  const mutualConnections = parseMutualConnections(
    textContentFrom(cardEl.querySelector("span.entity-result__simple-insight-text"))
  );

  const connectButton = findConnectButton(cardEl);

  return {
    profileId,
    name,
    title,
    location,
    mutualConnections,
    hasConnectButton: Boolean(connectButton)
  };
}

function extractModernCardInfo(cardEl) {
  const nameLink = cardEl.querySelector("a[data-view-name='search-result-lockup-title']");
  if (!nameLink) return null;

  const textContainer = nameLink.closest("p")?.parentElement;
  const rowTexts = textContainer
    ? Array.from(textContainer.children)
        .filter((node) => node.tagName === "P")
        .map((node) => node.textContent.trim())
        .filter(Boolean)
    : [];

  const detailRows = rowTexts.slice(1).filter((text) => !/•\s*\d/.test(text));

  return {
    name: nameLink.textContent?.trim() || "",
    title: detailRows[0] || "",
    location: detailRows[1] || ""
  };
}

function textContentFrom(...nodes) {
  const node = nodes.find(Boolean);
  return node ? node.textContent.trim() : "";
}

function parseMutualConnections(text) {
  if (!text) return 0;
  const match = text.replace(/,/g, "").match(/(\\d+)/);
  return match ? Number(match[1]) : 0;
}

function findConnectButton(scopeEl) {
  if (!scopeEl) return null;
  const buttons = Array.from(scopeEl.querySelectorAll("button, a"));
  return (
    buttons.find((btn) =>
      btn.textContent.toLowerCase().includes("connect")
    ) || null
  );
}

async function handleSendInvite(payload) {
  const { profileId, note = "", simulate = true } = payload || {};
  if (!profileId) return { ok: false, reason: "missing_profile_id" };

  const card = document.querySelector(`[data-outreach-id='${profileId}']`);
  if (!card) return { ok: false, reason: "profile_not_found" };

  const connectButton = findConnectButton(card);
  if (!connectButton) return { ok: false, reason: "connect_not_found" };

  connectButton.click();

  // Wait for the invite modal or inline send state.
  const modal = await waitForModal(DEFAULT_TIMEOUT_MS);
  if (!modal) return { ok: false, reason: "modal_not_found" };

  if (note && note.trim()) {
    const addNoteBtn = modal.querySelector("button[aria-label*='Add a note'],button[aria-label*='Add note']");
    if (addNoteBtn) {
      addNoteBtn.click();
      await sleep(150);
    }
    const noteArea =
      modal.querySelector("textarea[name='message']") ||
      modal.querySelector("textarea");
    if (!noteArea) return { ok: false, reason: "note_area_not_found" };
    noteArea.focus();
    noteArea.value = note.slice(0, 295);
    noteArea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (simulate) {
    return { ok: true, reason: "simulated", profileId };
  }

  const sendBtn =
    modal.querySelector("button[aria-label*='Send'], button[aria-label='Send now']") ||
    Array.from(modal.querySelectorAll("button")).find((btn) =>
      btn.textContent.toLowerCase().includes("send")
    );
  if (!sendBtn) return { ok: false, reason: "send_button_not_found" };

  sendBtn.click();
  await sleep(300);
  return { ok: true, reason: "sent", profileId };
}

async function handleNextPage() {
  const nextButton = findNextButton();

  if (!nextButton) {
    return { ok: false, reason: "next_not_found", navigated: false };
  }
  if (nextButton.disabled || nextButton.getAttribute("aria-disabled") === "true") {
    return { ok: false, reason: "next_disabled", navigated: false };
  }

  nextButton.click();
  return { ok: true, reason: "navigated", navigated: true };
}

function findNextButton() {
  const selectors = [
    "button[aria-label='Next']",
    "button[aria-label='Next Page']",
    "button[aria-label='Next page results']",
    "button[aria-label*='Next']",
    "button.artdeco-pagination__button--next",
    "a[aria-label='Next']",
    "a.artdeco-pagination__button--next"
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  const textMatch = Array.from(document.querySelectorAll("button, a"))
    .filter((el) => el.textContent && el.textContent.trim().length)
    .find((el) => el.textContent.trim().toLowerCase().startsWith("next"));
  return textMatch || null;
}

function waitForModal(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const modal = document.querySelector("div.send-invite, div#invite-modal, div[role='dialog']");
      if (modal) return resolve(modal);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(check);
    };
    check();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
