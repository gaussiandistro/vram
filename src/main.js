import "./style.css";

import {
  applySimulatedTime,
  currentDateTime,
  resetSimulatedTime,
  setClockFormat,
} from "./clock.js";

import { logError } from "./logger.js";

import { setLunchChoice } from "./lunchChoice.js";

import { getMotd, loadMotd } from "./motd.js";

import {
  disableNotifications,
  enableNotifications,
  notifSettings,
  restorePushSubscription,
  saveNotifSettings,
  syncNotificationPreferences,
} from "./notifications.js";

import {
  elements,
  renderDailyMessage,
  renderDayMessage,
  renderSchedule,
  updateClockFormatControl,
  updateDevStatus,
  updateMainTracker,
  updateNotificationUI,
} from "./render.js";

import { initPumpkinPact } from "./pumpkinPact.js";

import { loadScheduleData } from "./schedule.js";

import { applyTheme, initTheme } from "./themeApply.js";

import { initThemeCustomizer } from "./themeCustomizer.js";

import { toInputDate, toInputTime } from "./time.js";

updateClockFormatControl();
initTheme();
initThemeCustomizer();
initPumpkinPact();

elements.clockFormatToggle?.addEventListener("change", () => {
  setClockFormat(elements.clockFormatToggle.checked ? "24" : "12");
  updateEverything();
  renderSchedule(currentDateTime(), true);
});

elements.scheduleToggle?.addEventListener("click", () => {
  const open = elements.schedulePanel?.classList.contains("hidden") ?? false;
  if (open) renderSchedule(currentDateTime(), true);
  elements.schedulePanel?.classList.toggle("hidden", !open);
  elements.scheduleToggle?.setAttribute("aria-expanded", String(open));
  elements.scheduleToggle.textContent = open ? "Hide Schedule" : "Show Schedule";
});

elements.daySelector?.addEventListener("change", () => renderSchedule(currentDateTime(), true));

for (const selector of Object.values(elements.lunchSelectors)) {
  selector?.addEventListener("change", () => {
    const dayType = selector === elements.lunchSelectors.Blue ? "Blue" : "White";
    setLunchChoice(dayType, selector.value || null);
    saveNotifSettings();
    renderSchedule(currentDateTime(), true);
    updateEverything();
  });
}

const NOTIF_CHECKBOXES = [
  [elements.notifPeriodEnd, "periodEnd"],
  [elements.notifLunchEnd, "lunchEnd"],
  [elements.notifUpcoming, "upcoming"],
];

elements.notifEnable?.addEventListener("change", async () => {
  if (!elements.notifEnable.checked) {
    disableNotifications();
    updateNotificationUI();
    return;
  }

  try {
    await enableNotifications();
  } catch (error) {
    logError("Failed to enable notifications.", error);
    notifSettings.enabled = false;
  }

  updateNotificationUI();
});

for (const [checkbox, key] of NOTIF_CHECKBOXES)
  checkbox?.addEventListener("change", () => {
    notifSettings[key] = checkbox.checked;
    saveNotifSettings();
    updateNotificationUI();
  });

updateNotificationUI();

void syncNotificationPreferences().catch((error) => {
  logError("Failed to sync notification preferences.", error);
});

function updateEverything() {
  const now = currentDateTime();
  renderDayMessage(now);
  updateMainTracker(now);

  if (elements.schedulePanel && !elements.schedulePanel.classList.contains("hidden"))
    renderSchedule(now);
}

let updateTimer;

function queueNextUpdate() {
  if (document.hidden) return;

  updateTimer = setTimeout(
    () => {
      updateEverything();
      queueNextUpdate();
    },
    1020 - (Date.now() % 1000)
  );
}

document.addEventListener("visibilitychange", () => {
  clearTimeout(updateTimer);

  if (!document.hidden) {
    updateEverything();
    queueNextUpdate();
  }
});

window.addEventListener("focus", () => {
  if (!document.hidden) updateEverything();
});

if (import.meta.env.DEV && elements.devPanel) {
  const now = new Date();
  elements.devPanel.classList.remove("hidden");
  if (elements.devDate) elements.devDate.value = toInputDate(now);
  if (elements.devTime) elements.devTime.value = toInputTime(now);

  elements.devApply?.addEventListener("click", () => {
    const parsed = new Date(`${elements.devDate?.value}T${elements.devTime?.value}`);

    if (!elements.devDate?.value || !elements.devTime?.value || Number.isNaN(parsed.getTime())) {
      elements.devStatus.textContent = "Enter a valid date and time.";
      return;
    }

    applySimulatedTime(parsed);
    applyTheme();
    updateDevStatus();
    updateEverything();
    renderSchedule(currentDateTime(), true);
  });

  elements.devReset?.addEventListener("click", () => {
    resetSimulatedTime();
    applyTheme();
    if (elements.devDate) elements.devDate.value = toInputDate(new Date());
    if (elements.devTime) elements.devTime.value = toInputTime(new Date());
    updateDevStatus();
    updateEverything();
    renderSchedule(currentDateTime(), true);
  });

  updateDevStatus();
}

void loadScheduleData()
  .catch((error) => {
    logError("Failed to load schedule data.", error);
  })
  .finally(() => {
    updateEverything();
    queueNextUpdate();
  });

void loadMotd()
  .catch((error) => {
    logError("Failed to load the daily message.", error);
  })
  .finally(() => renderDailyMessage(getMotd()));

void (async () => {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    await navigator.serviceWorker.ready;
    await restorePushSubscription();
  } catch (error) {
    logError("Service worker / push subscription setup failed.", error);
  }
})();

const changelogToggle = document.getElementById("changelogToggle");
const changelogModal = document.getElementById("changelogModal");
const changelogClose = document.getElementById("changelogClose");

function openChangelog() {
  changelogModal?.classList.remove("hidden");
  changelogClose?.focus();
}

function closeChangelog() {
  changelogModal?.classList.add("hidden");
  changelogToggle?.focus();
}

changelogToggle?.addEventListener("click", openChangelog);

changelogClose?.addEventListener("click", closeChangelog);

changelogModal?.addEventListener("click", (event) => {
  if (event.target === changelogModal) {
    closeChangelog();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && changelogModal && !changelogModal.classList.contains("hidden")) {
    closeChangelog();
  }
});
