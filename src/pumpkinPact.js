import { isSecretUnlocked, unlockSecret } from "./secrets.js";
import { updateThemeSettings } from "./theme.js";
import { applyTheme } from "./themeApply.js";
import { refreshSeasonOptions } from "./themeCustomizer.js";

const SECRET_KEY = "pumpkinPact";
const SECRET_SEASON = "jackolantern";

const TAPS_REQUIRED = 5;
const TAP_WINDOW_MS = 3000;
const FLARE_MS = 2400;
const TOAST_MS = 4600;

const CANDY_COLORS = ["#ff9d3c", "#ffd166", "#f6e7cf", "#e2711d", "#c9a227"];

let tapTimes = [];
let flareTimer;

function createCandyBurst() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const burst = document.createElement("div");
  burst.className = "season-candy-burst";
  burst.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 18; index += 1) {
    const candy = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 18 + Math.random() * 0.35;
    const distance = 90 + Math.random() * 190;

    candy.className = "season-candy";
    candy.style.setProperty("--candy-x", `${Math.cos(angle) * distance}px`);
    candy.style.setProperty("--candy-y", `${Math.sin(angle) * distance - 50}px`);
    candy.style.setProperty("--candy-r", `${Math.round(Math.random() * 720 - 360)}deg`);
    candy.style.setProperty("--candy-delay", `${Math.random() * 0.12}s`);
    candy.style.setProperty("--candy-color", CANDY_COLORS[index % CANDY_COLORS.length]);

    burst.append(candy);
  }

  document.body.append(burst);
  setTimeout(() => burst.remove(), 2600);
}

function showToast(message) {
  document.querySelector(".season-toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "season-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);

  setTimeout(() => toast.remove(), TOAST_MS);
}

function playFlare() {
  const root = document.documentElement;

  root.classList.remove("pumpkin-pact");
  void root.offsetWidth;
  root.classList.add("pumpkin-pact");

  clearTimeout(flareTimer);
  flareTimer = setTimeout(() => root.classList.remove("pumpkin-pact"), FLARE_MS);

  createCandyBurst();
}

function unlockPact() {
  const firstUnlock = !isSecretUnlocked(SECRET_KEY);

  playFlare();

  if (!firstUnlock) return;

  unlockSecret(SECRET_KEY);

  updateThemeSettings({ season: SECRET_SEASON });
  applyTheme();
  refreshSeasonOptions();

  document.getElementById("themeSeason")?.dispatchEvent(new Event("change", { bubbles: true }));

  showToast("The patch accepts you. Jack-o'-lantern theme unlocked.");
  //showToast("The day of the spooky draws near...");
}

function isPumpkinAt(x, y) {
  return document.elementsFromPoint(x, y).some((element) => element.closest?.(".season-pumpkin"));
}

export function initPumpkinPact() {
  document.addEventListener("click", (event) => {
    const season = document.documentElement.dataset.season;

    if (season !== "halloween" && season !== SECRET_SEASON) return;

    const target = event.target;
    const onPumpkin =
      target.closest?.(".season-pumpkin") ||
      (target === document.body && isPumpkinAt(event.clientX, event.clientY));

    if (!onPumpkin) return;

    const now = Date.now();

    tapTimes = tapTimes.filter((time) => now - time < TAP_WINDOW_MS);
    tapTimes.push(now);

    if (tapTimes.length < TAPS_REQUIRED) return;

    tapTimes = [];
    unlockPact();
  });
}

const sounds = [
  "/sounds/cs1.mp3",
  "/sounds/cs2.mp3",
  "/sounds/cs3.mp3",
  "/sounds/cs4.mp3",
  "/sounds/cs5.mp3",
  "/sounds/cs6.mp3",
  "/sounds/cs7.mp3",
  "/sounds/cs8.mp3",
  "/sounds/cs9.mp3",
];

window.addEventListener("click", (event) => {
  const target = event.target.closest(".season-ghost, .season-pumpkin");

  if (!target) return;

  const randomIndex = Math.floor(Math.random() * sounds.length);
  const randomSound = sounds[randomIndex];

  const audio = new Audio(randomSound);
  audio.play();
});
