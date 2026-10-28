import { loadStorage, saveStorage } from "./storage.js";

const LUNCH_CHOICE_STORAGE_KEY = "vram-lunch-choice";

const LUNCH_IDS = new Set(["A", "B", "C"]);

let lunchChoices = loadLunchChoices();

function loadLunchChoices() {
  try {
    const parsed = JSON.parse(loadStorage(LUNCH_CHOICE_STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function storageKeyFor(dayType) {
  return dayType === "RAM" ? "White" : dayType;
}

export function getLunchChoice(dayType) {
  const choice = lunchChoices[storageKeyFor(dayType)];
  return LUNCH_IDS.has(choice) ? choice : null;
}

const LUNCH_GROUP_BY_CODE = {
  blue: "Blue",
  white: "White",
  ram: "RAM",
  er_white: "ER White",
};

export function getLunchChoicesByScheduleCode() {
  return Object.fromEntries(
    Object.entries(LUNCH_GROUP_BY_CODE).map(([code, dayType]) => [code, getLunchChoice(dayType)])
  );
}

export function setLunchChoice(dayType, lunchId) {
  const key = storageKeyFor(dayType);

  if (LUNCH_IDS.has(lunchId)) lunchChoices[key] = lunchId;
  else delete lunchChoices[key];

  try {
    saveStorage(LUNCH_CHOICE_STORAGE_KEY, JSON.stringify(lunchChoices));
  } catch {
    // no error handling here
  }

  return lunchChoices[key] || null;
}
