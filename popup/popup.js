import { OPERATIONS, STORAGE_KEYS } from "../shared/operations.js";
import { getLocal, setLocal } from "../shared/storage.js";

const operationSelect = document.getElementById("operationSelect");
const operationDescription = document.getElementById("operationDescription");
const saveSelectionButton = document.getElementById("saveSelection");
const openConfigButton = document.getElementById("openConfig");
const statusEl = document.getElementById("status");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderOperationOptions();
  operationSelect.addEventListener("change", handleChange);
  saveSelectionButton.addEventListener("click", handleSaveSelection);
  openConfigButton.addEventListener("click", openConfigPage);

  const stored = await getLocal([STORAGE_KEYS.selectedOperation]);
  const initialId = stored[STORAGE_KEYS.selectedOperation] || OPERATIONS[0].id;
  operationSelect.value = initialId;
  updateDescription(initialId);
}

function renderOperationOptions() {
  operationSelect.innerHTML = "";
  OPERATIONS.forEach((op) => {
    const option = document.createElement("option");
    option.value = op.id;
    option.textContent = op.name;
    operationSelect.appendChild(option);
  });
}

function handleChange(event) {
  updateDescription(event.target.value);
}

function updateDescription(opId) {
  const op = OPERATIONS.find((o) => o.id === opId);
  operationDescription.textContent = op?.description || "";
}

async function handleSaveSelection() {
  const opId = operationSelect.value;
  await setLocal({ [STORAGE_KEYS.selectedOperation]: opId });
  setStatus("Active operation saved.");
}

function openConfigPage() {
  chrome.runtime.openOptionsPage();
}

function setStatus(text) {
  statusEl.textContent = text;
  if (!text) return;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}
