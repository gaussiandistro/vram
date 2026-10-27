import { clockFormat, currentDateTime, simulatedNow } from "./clock.js";
import { getThemeSettings } from "./theme.js";
import {
  displayName,
  getDayType,
  getDisplayDayInfo,
  getLunches,
  getPersonalizedCurrentPeriod,
  getPersonalizedDisplaySchedule,
  getSchedule,
  getSchoolEndSeconds,
} from "./schedule.js";

import { getLunchChoice } from "./lunchChoice.js";
import { getCustomName, setCustomName } from "./periodNames.js";

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

const FINAL_MINUTE_SECONDS = 60;

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

const BANNER_SCROLLING_CLASS = "daily-message--scrolling";
const BANNER_SCROLL_SPEED_PX_PER_SEC = 60;
const BANNER_START_PAUSE_SECONDS = 5;

// The ticker keyframes are generated at runtime so the message can hold still
// for BANNER_START_PAUSE_SECONDS at its start on every loop while the scroll
// itself keeps a constant speed.
const bannerKeyframesStyle = document.createElement("style");

document.head.append(bannerKeyframesStyle);

function applyBannerKeyframes(scrollSeconds) {
  const totalSeconds = scrollSeconds + BANNER_START_PAUSE_SECONDS;
  const holdPercent = ((BANNER_START_PAUSE_SECONDS / totalSeconds) * 100).toFixed(2);

  bannerKeyframesStyle.textContent = `@keyframes banner-ticker {
  0%,
  ${holdPercent}% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(-50%);
  }
}`;

  return totalSeconds;
}

// Second, visual-only copy of the message so the ticker loops seamlessly.
function ensureBannerCopy(track, message) {
  let copy = track.querySelector('p[aria-hidden="true"]');

  if (!copy) {
    copy = document.createElement("p");
    copy.setAttribute("aria-hidden", "true");
    track.append(copy);
  }

  copy.replaceChildren();
  appendRichText(copy, message);

  // keep duplicate links out of the tab order (same styling as the originals)
  for (const link of copy.querySelectorAll("a")) link.tabIndex = -1;
}

// Scroll only when the message is wider than its viewport; otherwise center it statically.
function updateDailyMessageMotion() {
  const section = elements.dailyMessage;
  if (!section || section.hidden) return;

  const viewport = section.querySelector(".daily-message-viewport");
  const paragraph = section.querySelector("p");
  if (!viewport || !paragraph) return;

  // measure with the ticker styles applied to get the un-wrapped text width
  section.classList.add(BANNER_SCROLLING_CLASS);
  const textWidth = paragraph.offsetWidth;
  const availableWidth = viewport.clientWidth;

  if (textWidth <= availableWidth) {
    section.classList.remove(BANNER_SCROLLING_CLASS);
    section.style.removeProperty("--banner-duration");
    return;
  }

  const scrollSeconds = Math.max(8, textWidth / BANNER_SCROLL_SPEED_PX_PER_SEC);
  const totalSeconds = applyBannerKeyframes(scrollSeconds);

  section.style.setProperty("--banner-duration", `${totalSeconds.toFixed(1)}s`);
}

let bannerMotionFrame = 0;

function queueDailyMessageMotionUpdate() {
  cancelAnimationFrame(bannerMotionFrame);
  bannerMotionFrame = requestAnimationFrame(updateDailyMessageMotion);
}

export function renderDailyMessage(message) {
  const section = elements.dailyMessage;
  if (!section) return;

  if (!message) {
    section.hidden = true;
    section.classList.remove(BANNER_SCROLLING_CLASS);
    section.style.removeProperty("--banner-duration");
    return;
  }

  const track = section.querySelector(".daily-message-track");
  const paragraph = section.querySelector("p");

  if (track && paragraph) {
    paragraph.replaceChildren();
    appendRichText(paragraph, message);
    ensureBannerCopy(track, message);
  }

  section.hidden = false;
  updateDailyMessageMotion();
}

window.addEventListener("resize", queueDailyMessageMotionUpdate);

// the webfont can change the text width once it swaps in
if (document.fonts) document.fonts.ready.then(queueDailyMessageMotionUpdate).catch(() => {});

const byId = (id) => document.getElementById(id);

export const elements = {
  dailyMessage: byId("dailyMessage"),
  dayMessage: byId("dayMessage"),
  currentPeriod: byId("currentPeriod"),
  countdown: byId("countdown"),
  progressRing: byId("progressRing"),
  progressPercent: byId("progressPercent"),
  periodTimes: byId("periodTimes"),
  endOfDay: byId("endOfDay"),
  clockFormatToggle: byId("clockFormatToggle"),
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
  lunchSelectors: {
    Blue: byId("lunchSelectorBlue"),
    White: byId("lunchSelectorWhite"),
  },
  notifSection: byId("notifSection"),
  notifHint: byId("notifHint"),
  notifEnableOption: byId("notifEnableOption"),
  notifEnable: byId("notifEnable"),
  notifTypeOptions: byId("notifTypeOptions"),
  notifPeriodEnd: byId("notifPeriodEnd"),
  notifLunchEnd: byId("notifLunchEnd"),
  notifUpcoming: byId("notifUpcoming"),
  lunches: {
    A: {
      title: byId("lunchATitle"),
      timer: byId("lunchATimer"),
      status: byId("lunchAStatus"),
    },
    B: {
      title: byId("lunchBTitle"),
      timer: byId("lunchBTimer"),
      status: byId("lunchBStatus"),
    },
    C: {
      title: byId("lunchCTitle"),
      timer: byId("lunchCTimer"),
      status: byId("lunchCStatus"),
    },
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
let activeRename = null;

const scheduleRowKey = (item) => `${item.id}@${item.startSeconds}`;

const PENCIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function commitActiveRename() {
  if (!activeRename) return;

  const { input, item, cancelled } = activeRename;
  activeRename = null;

  if (!cancelled) setCustomName(item.id, input.value);
  updateMainTracker(currentDateTime());
}

function beginRename(item, nameSpan) {
  if (activeRename) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "name-input";
  input.maxLength = 100;
  input.value = getCustomName(item.id) || "";
  input.placeholder = item.name;
  input.setAttribute("aria-label", `Rename ${displayName(item)}`);

  activeRename = { input, item, cancelled: false };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      activeRename.cancelled = true;
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    if (activeRename?.input !== input) return;
    commitActiveRename();
    renderSchedule(currentDateTime(), true);
  });

  nameSpan.replaceWith(input);
  input.focus();
  input.select();
}

export function renderDayMessage(now) {
  if (elements.dayMessage?.classList.contains("loading")) {
    elements.dayMessage.classList.remove("loading");
    elements.dayMessage.removeAttribute("aria-busy");
  }

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

  if (degrees !== lastProgressDegrees && elements.progressRing) {
    const ring = elements.progressRing;
    const reset = lastProgressDegrees !== undefined && degrees < lastProgressDegrees;

    if (reset) ring.classList.add("no-anim");

    ring.style.setProperty("--progress", `${degrees}deg`);
    ring.style.setProperty("--progress-pct", `${(degrees / 360) * 100}%`);

    if (reset) {
      void ring.offsetWidth;
      ring.classList.remove("no-anim");
    }
  }

  if (percent !== lastProgressPercent) {
    elements.progressRing?.setAttribute("aria-valuenow", String(percent));
    setText(elements.progressPercent, `${percent}%`);
  }

  lastProgressDegrees = degrees;
  lastProgressPercent = percent;
}

function updateLunch(type, current, seconds) {
  if (getLunchChoice(type)) {
    setHidden(elements.lunchSection, true);
    return;
  }

  const isLunch = getLunches(type).some(
    (lunch) => lunch.startSeconds <= current.endSeconds && lunch.endSeconds > current.startSeconds
  );

  setHidden(elements.lunchSection, !isLunch);
  if (!isLunch) return;

  const lunchesForType = getLunches(type);

  for (const lunchId of ["A", "B", "C"]) {
    const lunch = lunchesForType.find((entry) => entry.id === lunchId);
    const target = elements.lunches[lunchId];
    if (!target) continue;

    setText(target.title, lunch ? displayName(lunch) : `${lunchId} Lunch`);
  }

  for (const lunch of lunchesForType) {
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

function setEndingEmphasis(enabled) {
  const emphasis = enabled && getThemeSettings().endingEmphasis !== false;

  elements.countdown?.classList.toggle("ending", emphasis);
  elements.progressRing?.classList.toggle("ending", emphasis);
}

function updateEndOfDay(type, seconds) {
  const element = elements.endOfDay;
  if (!element) return;

  const schedule = type ? getSchedule(type) : [];
  const startSeconds = schedule[0]?.startSeconds ?? 0;
  const endSeconds = type ? getSchoolEndSeconds(type) : 0;

  const visible =
    getThemeSettings().endOfDayCountdown === true &&
    endSeconds > 0 &&
    seconds >= startSeconds &&
    seconds < endSeconds;

  setHidden(element, !visible);
  if (visible) setText(element, `School ends in ${formatDuration(endSeconds - seconds)}`);
}

export function updateMainTracker(now) {
  const type = getDayType(now);
  const seconds = secondsIntoDay(now);

  updateEndOfDay(type, seconds);

  setEndingEmphasis(false);

  if (!type) {
    setText(elements.currentPeriod, "No school today");
    setText(elements.countdown, "--:--:--");
    setText(elements.periodTimes, "");
    setProgress(0);
    setHidden(elements.lunchSection, true);
    return;
  }

  const current = getPersonalizedCurrentPeriod(type, seconds);

  if (!current) {
    const first = getSchedule(type)[0];

    if (!first) {
      setText(elements.currentPeriod, "No schedule available");
      setText(elements.countdown, "--:--:--");
      setText(elements.periodTimes, "");
      setProgress(0);
      setHidden(elements.lunchSection, true);
      return;
    }

    const next =
      getPersonalizedDisplaySchedule(type).find((item) => item.startSeconds > seconds) || null;

    if (seconds < first.startSeconds) {
      setText(elements.currentPeriod, "School starts in");
      setText(elements.countdown, formatDuration(first.startSeconds - seconds));
      setText(elements.periodTimes, formatClock(first.start, clockFormat));
      setProgress(0);
    } else if (next) {
      setText(elements.currentPeriod, `${displayName(next)} starts in`);
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

  setEndingEmphasis(current.endSeconds - seconds <= FINAL_MINUTE_SECONDS);

  setText(elements.currentPeriod, displayName(current));
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
  const current =
    getDayType(now) === type ? getPersonalizedCurrentPeriod(type, secondsIntoDay(now)) : null;
  const key = current ? scheduleRowKey(current) : undefined;

  if (key === highlightedPeriodId) return;
  if (highlightedPeriodId) scheduleRows.get(highlightedPeriodId)?.classList.remove("current");
  if (key) scheduleRows.get(key)?.classList.add("current");
  highlightedPeriodId = key;
}

function updateLunchPickers(type) {
  for (const dayType of ["Blue", "White"]) {
    const selector = elements.lunchSelectors[dayType];
    if (!selector) continue;

    const hasLunches = type ? (dayType === type ? getLunches(type).length > 0 : true) : false;
    selector.closest(".lunch-picker")?.classList.toggle("hidden", !hasLunches);

    const choice = getLunchChoice(dayType);
    if (selector.value !== (choice || "")) selector.value = choice || "";
  }
}

export function renderSchedule(now, force = false) {
  if (!elements.scheduleList || !elements.scheduleTitle) return;

  const type = selectedScheduleType(now);
  if (!force && type === renderedScheduleType) return updateScheduleHighlight(type, now);

  renderedScheduleType = type;
  highlightedPeriodId = undefined;
  scheduleRows = new Map();

  commitActiveRename();
  updateLunchPickers(type);

  if (!type) {
    setText(elements.scheduleTitle, "No Schedule");
    elements.scheduleList.replaceChildren();
    return;
  }

  setText(elements.scheduleTitle, `${type} Day Schedule`);
  const fragment = document.createDocumentFragment();

  for (const item of getPersonalizedDisplaySchedule(type)) {
    // Passing periods are redundant/unncessary imo in the schedule list, but the clock still shows them
    if (item.kind === "passing") continue;

    const row = document.createElement("div");
    row.className = `schedule-row${item.isLunch ? " lunch-row" : ""}`;
    if (!item.isLunch) scheduleRows.set(scheduleRowKey(item), row);

    const nameCell = document.createElement("span");
    nameCell.className = "schedule-name";

    const name = document.createElement("span");
    name.className = "schedule-text";
    name.textContent = displayName(item);
    nameCell.append(name);

    if (item.kind !== "passing") {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-btn";
      editButton.innerHTML = PENCIL_ICON;
      editButton.setAttribute("aria-label", `Rename ${displayName(item)}`);
      editButton.addEventListener("click", () => beginRename(item, name));
      nameCell.append(editButton);
    }

    const time = document.createElement("span");
    time.className = "schedule-time";
    time.textContent = `${formatClock(item.start, clockFormat)} – ${formatClock(item.end, clockFormat)}`;

    row.append(nameCell, time);
    fragment.append(row);
  }

  elements.scheduleList.replaceChildren(fragment);
  updateScheduleHighlight(type, now);
}

export function updateClockFormatControl() {
  if (elements.clockFormatToggle) elements.clockFormatToggle.checked = clockFormat === "24";
}

export function updateNotificationUI() {
  const unsupported = !notificationsSupported();
  setHidden(elements.notifSection, unsupported);
  if (unsupported) return;

  const blocked = notificationPermission() === "denied";

  if (elements.notifEnable) {
    elements.notifEnable.checked = notifSettings.enabled;
    elements.notifEnable.disabled = blocked;
  }

  setText(
    elements.notifHint,
    blocked
      ? "Notifications are blocked in your browser settings."
      : "Notifications will appear even if the tab or browser is closed!"
  );

  for (const [checkbox, key] of [
    [elements.notifPeriodEnd, "periodEnd"],
    [elements.notifLunchEnd, "lunchEnd"],
    [elements.notifUpcoming, "upcoming"],
  ])
    if (checkbox) {
      checkbox.checked = notifSettings[key];
      checkbox.disabled = blocked;
    }

  const typeOptionsEnabled = notificationPermission() === "granted" && notifSettings.enabled;
  elements.notifTypeOptions?.classList.toggle("off", !typeOptionsEnabled);

  if (elements.notifEnableOption)
    elements.notifEnableOption.classList.toggle("notif-option-active", typeOptionsEnabled);
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
