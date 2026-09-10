import { clockFormat, currentDateTime, simulatedNow } from "./clock.js";
import {
  getDayType,
  getCurrentPeriod,
  getDisplayDayInfo,
  getDisplaySchedule,
  getLunches,
  getNextPeriod,
  getSchedule,
} from "./schedule.js";

import { notifSettings, notificationPermission, notificationsSupported } from "./notifications.js";

import {
  formatClock,
  formatDuration,
  formatShortDuration,
  dateKey,
  secondsIntoDay,
} from "./time.js";

const DAY_CLASS = {
  Blue: "day-blue",
  White: "day-white",
  RAM: "day-ram",
  "ER White": "day-white",
};

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function appendRichText(parent, text) {
  let match;
  let cursor = 0;

	LINK_PATTERN.lastIndex = 0;

  while ((match = LINK_PATTERN.exec(text))) {
    if (match.index > cursor) parent.append(text.slice(cursor, match.index));

    let url = null;
    try {
      url = new URL(match[2]);
		} catch {
			// just let it be null
    }

    if (url && ALLOWED_LINK_PROTOCOLS.has(url.protocol)) {
      const link = document.createElement("a");
      link.href = url.href;
      link.textContent = match[1];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
    } else {
      parent.append(match[0]);
    }

    cursor = LINK_PATTERN.lastIndex;
  }

  if (cursor < text.length) parent.append(text.slice(cursor));
}

export function renderDailyMessage(message) {
  const section = elements.dailyMessage;
  if (!section) return;

  if (!message) {
    section.hidden = true;
    return;
  }

  const paragraph = section.querySelector("p");

  if (paragraph) {
    paragraph.replaceChildren();
    appendRichText(paragraph, message);
  }

  section.hidden = false;
}

const byId = (id) => document.getElementById(id);

export const elements = {
  dailyMessage: byId("dailyMessage"),
  dayMessage: byId("dayMessage"),
  currentPeriod: byId("currentPeriod"),
  countdown: byId("countdown"),
  progressRing: byId("progressRing"),
  progressPercent: byId("progressPercent"),
  periodTimes: byId("periodTimes"),
  clockToggle: byId("clockToggle"),
  devPanel: byId("devPanel"),
  devDate: byId("devDate"),
  devTime: byId("devTime"),
  devApply: byId("devApply"),
  devReset: byId("devReset"),
  devStatus: byId("devStatus"),
  lunchSection: byId("lunchSection"),
  scheduleToggle: byId("scheduleToggle"),
  schedulePanel: byId("schedulePanel"),
  scheduleList: byId("scheduleList"),
  scheduleTitle: byId("scheduleTitle"),
  daySelector: byId("daySelector"),
  notifSection: byId("notifSection"),
  notifToggle: byId("notifToggle"),
  notifHint: byId("notifHint"),
  notifOptions: byId("notifOptions"),
  notifPeriodEnd: byId("notifPeriodEnd"),
  notifLunchEnd: byId("notifLunchEnd"),
  notifUpcoming: byId("notifUpcoming"),
  lunches: {
    A: { timer: byId("lunchATimer"), status: byId("lunchAStatus") },
    B: { timer: byId("lunchBTimer"), status: byId("lunchBStatus") },
    C: { timer: byId("lunchCTimer"), status: byId("lunchCStatus") },
  },
};

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function setHidden(element, hidden) {
  element?.classList.toggle("hidden", hidden);
}

let lastDayMessageKey = "";
let lastProgressDegrees;
let lastProgressPercent;
let renderedScheduleType;
let highlightedPeriodId;
let scheduleRows = new Map();

export function renderDayMessage(now) {
  const info = getDisplayDayInfo(now);
  if (!info.type) return setText(elements.dayMessage, "No school.");

  const key = `${dateKey(info.date)}:${info.type}:${info.relation}`;
  if (key === lastDayMessageKey) return;

  lastDayMessageKey = key;
  const span = document.createElement("span");
  span.className = DAY_CLASS[info.type] || "";
  span.textContent = info.type;

  const article = info.type === "ER White" ? "an" : "a";

  if (info.relation === "today")
    elements.dayMessage?.replaceChildren(`Today is ${article} `, span, " Day.");
  else
    elements.dayMessage?.replaceChildren(
      `${info.date.toLocaleDateString("en-US", { weekday: "long" })} will be ${article} `,
      span,
      " Day."
    );
}

export function setProgress(progress) {
  const normalized = Math.max(0, Math.min(1, progress));
  const percent = Math.round(normalized * 100);
  const degrees = Math.round(normalized * 36000) / 100;

  if (degrees !== lastProgressDegrees)
    elements.progressRing?.style.setProperty("--progress", `${degrees}deg`);
  if (percent !== lastProgressPercent) {
    elements.progressRing?.setAttribute("aria-valuenow", String(percent));
    setText(elements.progressPercent, `${percent}%`);
  }

  lastProgressDegrees = degrees;
  lastProgressPercent = percent;
}

function updateLunch(type, current, seconds) {
  const isLunch = getLunches(type).some(
    (lunch) => lunch.startSeconds <= current.endSeconds && lunch.endSeconds > current.startSeconds
  );

  setHidden(elements.lunchSection, !isLunch);
  if (!isLunch) return;

  for (const lunch of getLunches(type)) {
    const target = elements.lunches[lunch.id];
    if (!target) continue;

    const remaining =
      seconds < lunch.startSeconds
        ? lunch.startSeconds - seconds
        : seconds < lunch.endSeconds
          ? lunch.endSeconds - seconds
          : 0;

    setText(target.timer, formatShortDuration(remaining));

    setText(
      target.status,
      seconds < lunch.startSeconds
        ? "until lunch"
        : seconds < lunch.endSeconds
          ? "remaining"
          : "finished"
    );
  }
}

export function updateMainTracker(now) {
  const type = getDayType(now);
  const seconds = secondsIntoDay(now);

  if (!type) {
    setText(elements.currentPeriod, "No school today");
    setText(elements.countdown, "--:--:--");
    setText(elements.periodTimes, "");
    setProgress(0);
    setHidden(elements.lunchSection, true);
    return;
  }

  const current = getCurrentPeriod(type, seconds);

  if (!current) {
    const first = getSchedule(type)[0];
    const next = getNextPeriod(type, seconds);

    if (seconds < first.startSeconds) {
      setText(elements.currentPeriod, "School starts in");
      setText(elements.countdown, formatDuration(first.startSeconds - seconds));
      setText(elements.periodTimes, formatClock(first.start, clockFormat));
      setProgress(0);
    } else if (next) {
      setText(elements.currentPeriod, `${next.name} starts in`);
      setText(elements.countdown, formatDuration(next.startSeconds - seconds));
      setText(elements.periodTimes, formatClock(next.start, clockFormat));
      setProgress(0);
    } else {
      setText(elements.currentPeriod, "School is over");
      setText(elements.countdown, "00:00:00");
      setText(elements.periodTimes, "");
      setProgress(1);
    }

    setHidden(elements.lunchSection, true);

    return;
  }

  setText(elements.currentPeriod, current.name);
  setText(elements.countdown, formatDuration(current.endSeconds - seconds));
  setText(
    elements.periodTimes,
    `${formatClock(current.start, clockFormat)} – ${formatClock(current.end, clockFormat)}`
  );
  setProgress((seconds - current.startSeconds) / (current.endSeconds - current.startSeconds));
  updateLunch(type, current, seconds);
}

function selectedScheduleType(now) {
  return !elements.daySelector || elements.daySelector.value === "auto"
    ? getDisplayDayInfo(now).type
    : elements.daySelector.value;
}

function updateScheduleHighlight(type, now) {
  const id = getDayType(now) === type ? getCurrentPeriod(type, secondsIntoDay(now))?.id : undefined;
  if (id === highlightedPeriodId) return;
  if (highlightedPeriodId) scheduleRows.get(highlightedPeriodId)?.classList.remove("current");
  if (id) scheduleRows.get(id)?.classList.add("current");
  highlightedPeriodId = id;
}

export function renderSchedule(now, force = false) {
  if (!elements.scheduleList || !elements.scheduleTitle) return;

  const type = selectedScheduleType(now);
  if (!force && type === renderedScheduleType) return updateScheduleHighlight(type, now);

  renderedScheduleType = type;
  highlightedPeriodId = undefined;
  scheduleRows = new Map();

  if (!type) {
    setText(elements.scheduleTitle, "No Schedule");
    elements.scheduleList.replaceChildren();
    return;
  }

  setText(elements.scheduleTitle, `${type} Day Schedule`);
  const fragment = document.createDocumentFragment();

  for (const item of getDisplaySchedule(type)) {
    const row = document.createElement("div");
    row.className = `schedule-row${item.isLunch ? " lunch-row" : ""}`;
    if (!item.isLunch) scheduleRows.set(item.id, row);

    const name = document.createElement("span");
    name.textContent = item.name;

    const time = document.createElement("span");
    time.className = "schedule-time";
    time.textContent = `${formatClock(item.start, clockFormat)} – ${formatClock(item.end, clockFormat)}`;

    row.append(name, time);
    fragment.append(row);
  }

  elements.scheduleList.replaceChildren(fragment);
  updateScheduleHighlight(type, now);
}

export function updateClockToggleLabel() {
  setText(elements.clockToggle, clockFormat === "12" ? "24h" : "12h");
  elements.clockToggle?.setAttribute("aria-pressed", String(clockFormat === "24"));
}

export function updateNotificationUI() {
  const permission = notificationPermission();
  const unsupported = !notificationsSupported();
  setHidden(elements.notifToggle, unsupported);
  setHidden(elements.notifSection, unsupported);
  if (unsupported) return;

  elements.notifToggle.disabled = permission === "denied";

  elements.notifToggle.setAttribute(
    "aria-pressed",
    String(permission === "granted" && notifSettings.enabled)
  );

  setText(
    elements.notifToggle,
    permission === "denied"
      ? "Notifications blocked"
      : notifSettings.enabled
        ? "Disable Notifications"
        : "Enable Notifications"
  );

  setHidden(elements.notifOptions, permission !== "granted" || !notifSettings.enabled);

  setText(
    elements.notifHint,
    permission === "denied"
      ? "Notifications only work on Safari; they are blocked on Chrome."
      : "Notifications only work on Safari; they are blocked on Chrome. Notifications will appear even if the tab or browser is closed!"
  );

  setHidden(elements.notifHint, permission !== "denied");

  for (const [checkbox, key] of [
    [elements.notifPeriodEnd, "periodEnd"],
    [elements.notifLunchEnd, "lunchEnd"],
    [elements.notifUpcoming, "upcoming"],
  ])
    if (checkbox) checkbox.checked = notifSettings[key];
}

export function updateDevStatus() {
  if (!import.meta.env.DEV || !elements.devStatus) return;

  setText(
    elements.devStatus,
    simulatedNow
      ? `Simulating ${currentDateTime().toLocaleString()}`
      : "Using your computer's current time."
  );
}
