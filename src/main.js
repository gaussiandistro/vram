import "./style.css";

import {
  applySimulatedTime,
  currentDateTime,
  resetSimulatedTime,
  toggleClockFormat,
} from "./clock.js";

import { logError } from "./logger.js";

import { getMotd, loadMotd } from "./motd.js";

import {
  disableNotifications,
  enableNotifications,
  notifSettings,
  restorePushSubscription,
  saveNotifSettings,
} from "./notifications.js";

import {
  elements,
  renderDailyMessage,
  renderDayMessage,
  renderSchedule,
  updateClockToggleLabel,
  updateDevStatus,
  updateMainTracker,
  updateNotificationUI,
} from "./render.js";

import { loadScheduleData } from "./schedule.js";
import { toInputDate, toInputTime } from "./time.js";

updateClockToggleLabel();

elements.clockToggle?.addEventListener("click", () => {
  toggleClockFormat();
  updateClockToggleLabel();
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

const NOTIF_CHECKBOXES = [
  [elements.notifPeriodEnd, "periodEnd"],
  [elements.notifLunchEnd, "lunchEnd"],
  [elements.notifUpcoming, "upcoming"],
];

elements.notifToggle?.addEventListener("click", async () => {
  if (notifSettings.enabled) {
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
    updateDevStatus();
    updateEverything();
    renderSchedule(currentDateTime(), true);
  });

  elements.devReset?.addEventListener("click", () => {
    resetSimulatedTime();
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
