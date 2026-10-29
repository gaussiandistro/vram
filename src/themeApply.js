import { currentDateTime } from "./clock.js";
import { getSeason, resolveSeasonId } from "./seasons.js";
import { getThemeSettings, reloadThemeSettings, THEME_SETTINGS_STORAGE_KEY } from "./theme.js";

const root = document.documentElement;
const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function resolveMode() {
  const mode = getThemeSettings().mode;

  if (mode === "light" || mode === "dark") return mode;

  return darkModeQuery.matches ? "dark" : "light";
}

export function refreshThemeColorMeta() {
  const background = getComputedStyle(root).getPropertyValue("--background").trim();

  if (!background) return;

  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", background);
  }
}

export function applyTheme() {
  const settings = getThemeSettings();
  const season = resolveSeasonId(settings.season, currentDateTime());
  const activeSeason = season ? getSeason(season) : null;

  root.dataset.theme = activeSeason?.mode ?? resolveMode();

  if (season) root.dataset.season = season;
  else delete root.dataset.season;

  root.dataset.seasonEffects = settings.seasonEffects === false ? "off" : "on";

  if (season) {
    root.style.removeProperty("--text");
    root.style.removeProperty("--background");
  } else {
    if (settings.textColor) root.style.setProperty("--text", settings.textColor);
    else root.style.removeProperty("--text");

    if (settings.backgroundColor) root.style.setProperty("--background", settings.backgroundColor);
    else root.style.removeProperty("--background");
  }

  refreshThemeColorMeta();
}

let midnightTimer;

function scheduleMidnightRefresh() {
  clearTimeout(midnightTimer);

  const now = currentDateTime();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 2, 0);

  midnightTimer = setTimeout(
    () => {
      applyTheme();
      scheduleMidnightRefresh();
    },
    Math.max(1000, nextMidnight - now)
  );
}

export function initTheme() {
  applyTheme();
  requestAnimationFrame(refreshThemeColorMeta);
  scheduleMidnightRefresh();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applyTheme();
  });

  window.addEventListener("focus", applyTheme);

  darkModeQuery.addEventListener("change", () => {
    const mode = getThemeSettings().mode;

    if (mode !== "light" && mode !== "dark") applyTheme();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== THEME_SETTINGS_STORAGE_KEY) return;

    reloadThemeSettings();
    applyTheme();
  });
}
