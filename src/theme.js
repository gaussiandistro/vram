import { loadStorage, removeStorage, saveStorage } from "./storage.js";

const THEME_SETTINGS_STORAGE_KEY = "vram-theme-settings";
const LEGACY_THEME_STORAGE_KEY = "vram-theme";

const THEMES = new Set(["light", "dark"]);

function loadSettings() {
  let parsed = null;

  try {
    const stored = JSON.parse(loadStorage(THEME_SETTINGS_STORAGE_KEY));
    if (stored && typeof stored === "object") parsed = stored;
  } catch {
    // No error handling here
  }

  // this is just a one-item migration from the legacy storage key
  if (!parsed?.mode) {
    const legacy = loadStorage(LEGACY_THEME_STORAGE_KEY);
    if (THEMES.has(legacy)) parsed = { ...parsed, mode: legacy };
  }

  return parsed || {};
}

let settings = loadSettings();

function persistSettings() {
  saveStorage(THEME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  removeStorage(LEGACY_THEME_STORAGE_KEY);
}

if (loadStorage(LEGACY_THEME_STORAGE_KEY)) persistSettings();

export function getThemeSettings() {
  return settings;
}

export function updateThemeSettings(patch) {
  settings = { ...settings, ...patch };
  persistSettings();
}

export function replaceThemeSettings(next) {
  settings = next && typeof next === "object" ? next : {};
  persistSettings();
}
