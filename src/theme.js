import { loadStorage, saveStorage } from "./storage.js";

const THEME_STORAGE_KEY = "vram-theme";

const THEMES = new Set(["light", "dark"]);

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyStoredTheme() {
  const stored = loadStorage(THEME_STORAGE_KEY);
  if (THEMES.has(stored || "")) document.documentElement.dataset.theme = stored;
}

applyStoredTheme();

function activeTheme() {
  return document.documentElement.dataset.theme || systemTheme();
}

export function currentTheme() {
  return activeTheme();
}

export function toggleTheme() {
  const next = activeTheme() === "dark" ? "light" : "dark";

  document.documentElement.dataset.theme = next;
  saveStorage(THEME_STORAGE_KEY, next);

  return next;
}

window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!THEMES.has(document.documentElement.dataset.theme || "")) return;

  const stored = loadStorage(THEME_STORAGE_KEY);
  if (THEMES.has(stored || "")) return;

  delete document.documentElement.dataset.theme;
});
