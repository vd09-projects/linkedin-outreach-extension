import { OPERATIONS, STORAGE_KEYS } from "../shared/operations.js";
import { getLocal, setLocal } from "../shared/storage.js";

const operationSelect = document.getElementById("operationSelect");
const operationDescription = document.getElementById("operationDescription");
const formEl = document.getElementById("configForm");
const errorsEl = document.getElementById("formErrors");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");

let currentOperation = null;
let fieldErrorEls = {};

document.addEventListener("DOMContentLoaded", init);

function defaultValue(field) {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "number") return 0;
  return "";
}

async function init() {
  renderOperationOptions();
  operationSelect.addEventListener("change", handleOperationChange);
  saveBtn.addEventListener("click", handleSave);
  resetBtn.addEventListener("click", handleReset);

  const stored = await getLocal([STORAGE_KEYS.selectedOperation]);
  const initialId = stored[STORAGE_KEYS.selectedOperation] || OPERATIONS[0].id;
  operationSelect.value = initialId;
  await loadOperation(initialId);
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

async function handleOperationChange(event) {
  const opId = event.target.value;
  await setLocal({ [STORAGE_KEYS.selectedOperation]: opId });
  await loadOperation(opId);
}

async function loadOperation(opId) {
  currentOperation = OPERATIONS.find((o) => o.id === opId);
  if (!currentOperation) return;

  operationDescription.textContent = currentOperation.description || "";
  const stored = await getLocal([STORAGE_KEYS.operationConfigs]);
  const configs = stored[STORAGE_KEYS.operationConfigs] || {};
  const savedValues = configs[opId] || {};
  renderForm(currentOperation, savedValues);
}

function renderForm(operation, savedValues) {
  formEl.innerHTML = "";
  errorsEl.textContent = "";
  fieldErrorEls = {};

  operation.fields.forEach((field) => {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("label");
    label.setAttribute("for", field.key);
    label.textContent = field.label;
    row.appendChild(label);

    let input;
    if (field.type === "textarea") {
      input = document.createElement("textarea");
    } else {
      input = document.createElement("input");
      input.type = field.type === "number" ? "number" : "text";
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
    }
    input.id = field.key;
    input.name = field.key;
    input.placeholder = field.placeholder || "";
    input.value = savedValues[field.key] ?? defaultValue(field);
    row.appendChild(input);

    const error = document.createElement("div");
    error.className = "field-error";
    error.dataset.fieldKey = field.key;
    fieldErrorEls[field.key] = error;
    row.appendChild(error);

    formEl.appendChild(row);
  });
}

function gatherValues(operation) {
  const formData = new FormData(formEl);
  const values = {};
  operation.fields.forEach((field) => {
    let raw = formData.get(field.key);
    if (field.type === "number") {
      const parsed = raw === "" ? null : Number(raw);
      values[field.key] = Number.isFinite(parsed) ? parsed : null;
    } else {
      values[field.key] = raw ?? "";
    }
  });
  return values;
}

function validate(operation, values) {
  const errors = {};
  const global = [];

  operation.fields.forEach((field) => {
    const value = values[field.key];
    if (field.required) {
      const isEmpty =
        value === null || value === undefined || value === "" || Number.isNaN(value);
      if (isEmpty) {
        errors[field.key] = "This field is required.";
        return;
      }
    }

    if (field.type === "number" && value !== null) {
      if (!Number.isFinite(value)) {
        errors[field.key] = "Enter a valid number.";
        return;
      }
      if (field.min !== undefined && value < field.min) {
        errors[field.key] = `Must be at least ${field.min}.`;
        return;
      }
      if (field.max !== undefined && value > field.max) {
        errors[field.key] = `Must be at most ${field.max}.`;
        return;
      }
    }
  });

  return { errors, global };
}

async function handleSave(event) {
  event.preventDefault();
  if (!currentOperation) return;

  clearErrors();
  const values = gatherValues(currentOperation);
  const { errors, global } = validate(currentOperation, values);
  displayErrors(errors, global);

  if (Object.keys(errors).length > 0 || global.length > 0) {
    setStatus("Fix errors to save.");
    return;
  }

  const stored = await getLocal([STORAGE_KEYS.operationConfigs]);
  const configs = stored[STORAGE_KEYS.operationConfigs] || {};
  configs[currentOperation.id] = values;
  await setLocal({
    [STORAGE_KEYS.operationConfigs]: configs,
    [STORAGE_KEYS.selectedOperation]: currentOperation.id
  });

  setStatus("Saved.");
}

async function handleReset(event) {
  event.preventDefault();
  if (!currentOperation) return;
  renderForm(currentOperation, {});
  clearErrors();
  setStatus("Reset to defaults.");
}

function clearErrors() {
  errorsEl.textContent = "";
  Object.values(fieldErrorEls).forEach((el) => {
    el.textContent = "";
  });
}

function displayErrors(errors, globalErrors) {
  Object.entries(errors).forEach(([fieldKey, message]) => {
    const el = fieldErrorEls[fieldKey];
    if (el) el.textContent = message;
  });
  if (globalErrors.length > 0) {
    errorsEl.textContent = globalErrors.join(" ");
  }
}

function setStatus(text) {
  statusEl.textContent = text;
  if (!text) return;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2500);
}
