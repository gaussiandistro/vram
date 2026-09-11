import { loadStorage, saveStorage } from "./storage.js";

const PERIOD_NAMES_STORAGE_KEY = "vram-period-names";

const MAX_NAME_LENGTH = 30;

let periodNames = loadPeriodNames();

function loadPeriodNames() {
  try {
    const parsed = JSON.parse(loadStorage(PERIOD_NAMES_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getCustomName(blockId) {
  return periodNames[blockId] || null;
}

export function setCustomName(blockId, name) {
  const trimmed = (name || "").trim().slice(0, MAX_NAME_LENGTH);

  if (trimmed) periodNames[blockId] = trimmed;
  else delete periodNames[blockId];

  try {
    saveStorage(PERIOD_NAMES_STORAGE_KEY, JSON.stringify(periodNames));
  } catch {
    // no error handling here
  }

  return periodNames[blockId] || null;
}
