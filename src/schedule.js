import { getLunchChoice } from "./lunchChoice.js";
import { getCustomName } from "./periodNames.js";
import { supabase } from "./supabase.js";
import { dateKey, secondsFromTime, secondsIntoDay, timeFromSeconds } from "./time.js";

let schedules = {};
let lunches = {};
let passingMinutes = {};
let dayTypes = {};
let displaySchedules = {};
let schoolEndSeconds = {};

export function rebuildScheduleIndexes() {
  schoolEndSeconds = Object.fromEntries(
    Object.entries(schedules).map(([name, schedule]) => [
      name,
      schedule[schedule.length - 1]?.endSeconds || 0,
    ])
  );

  displaySchedules = Object.fromEntries(
    Object.entries(schedules).map(([name, schedule]) => [
      name,
      [
        ...schedule.map((item) => ({ ...item, isLunch: false })),
        ...(lunches[name] || []).map((item) => ({ ...item, isLunch: true })),
      ].sort((a, b) => a.startSeconds - b.startSeconds),
    ])
  );
}

function passingSecondsFor(type) {
  return (passingMinutes[type] || 0) * 60;
}

function splitPeriodAroundLunch(type, period, lunch) {
  const segments = [];
  const passing = passingSecondsFor(type);

  const classEnd = lunch.startSeconds - passing;

  if (classEnd > period.startSeconds) {
    segments.push({ ...period, end: timeFromSeconds(classEnd), endSeconds: classEnd });

    segments.push({
      ...period,
      kind: "passing",
      start: timeFromSeconds(classEnd),
      startSeconds: classEnd,
      end: lunch.start,
      endSeconds: lunch.startSeconds,
    });
  } else if (period.startSeconds < lunch.startSeconds) {
    segments.push({ ...period, end: lunch.start, endSeconds: lunch.startSeconds });
  }

  segments.push({ ...lunch, isLunch: true });

  if (lunch.endSeconds < period.endSeconds) {
    const classStart = Math.min(lunch.endSeconds + passing, period.endSeconds);

    if (classStart > lunch.endSeconds)
      segments.push({
        ...period,
        kind: "passing",
        start: lunch.end,
        startSeconds: lunch.endSeconds,
        end: timeFromSeconds(classStart),
        endSeconds: classStart,
      });

    segments.push({
      ...period,
      start: timeFromSeconds(classStart),
      startSeconds: classStart,
    });
  }

  return segments;
}

export function getPersonalizedDisplaySchedule(type) {
  const base = displaySchedules[type] || [];
  const lunchId = getLunchChoice(type);
  if (!lunchId) return base;

  const lunch = getLunches(type).find((entry) => entry.id === lunchId);
  if (!lunch) return base;

  const period = (schedules[type] || []).find((item) => item.id === lunch.duringBlock);
  if (!period) return base;

  const result = [];

  for (const item of base) {
    if (item.isLunch) continue;

    if (item.id === period.id) result.push(...splitPeriodAroundLunch(type, period, lunch));
    else result.push(item);
  }

  return result;
}

export function getPersonalizedCurrentPeriod(type, seconds) {
  const hasChoice = getLunchChoice(type) !== null;

  return (
    getPersonalizedDisplaySchedule(type).find(
      (item) =>
        (hasChoice || !item.isLunch) && seconds >= item.startSeconds && seconds < item.endSeconds
    ) || null
  );
}

export async function loadScheduleData() {
  if (!supabase) return;

  const { data, error } = await supabase.rpc("get_app_bootstrap");

  if (error) throw error;

  const bundle = data || {};
  const nameByCode = new Map();

  const nextSchedules = {};
  const nextLunches = {};
  const nextPassing = {};

  for (const type of bundle.types || []) {
    nameByCode.set(type.code, type.name);
    nextSchedules[type.name] = [];
    nextLunches[type.name] = [];
    nextPassing[type.name] = Number(type.passing_minutes) || 0;
  }

  for (const block of bundle.blocks || []) {
    const name = nameByCode.get(block.schedule_type_code);
    if (!name) continue;

    nextSchedules[name].push({
      id: block.code,
      name: block.name,
      kind: block.kind,
      start: block.start_time,
      end: block.end_time,
      startSeconds: secondsFromTime(block.start_time),
      endSeconds: secondsFromTime(block.end_time),
    });
  }

  for (const lunch of bundle.lunches || []) {
    const name = nameByCode.get(lunch.schedule_type_code);
    if (!name) continue;

    nextLunches[name].push({
      id: lunch.code,
      name: lunch.name,
      kind: "lunch",
      duringBlock: lunch.during_block_code,
      start: lunch.start_time,
      end: lunch.end_time,
      startSeconds: secondsFromTime(lunch.start_time),
      endSeconds: secondsFromTime(lunch.end_time),
    });
  }

  for (const schedule of Object.values(nextSchedules))
    schedule.sort((a, b) => a.startSeconds - b.startSeconds);

  for (const lunch of Object.values(nextLunches))
    lunch.sort((a, b) => a.startSeconds - b.startSeconds);

  const nextDayTypes = {};

  for (const [date, code] of Object.entries(bundle.days || {})) {
    const name = nameByCode.get(code);
    if (name) nextDayTypes[date] = name;
  }

  schedules = nextSchedules;
  lunches = nextLunches;
  passingMinutes = nextPassing;
  dayTypes = nextDayTypes;

  rebuildScheduleIndexes();
}

export function getDayType(date) {
  return dayTypes[dateKey(date)] || null;
}

export function getNextSchoolDay(date) {
  const MAX_DAY_SEARCH = 400;
  const next = new Date(date);

  for (let i = 0; i < MAX_DAY_SEARCH; i++) {
    next.setDate(next.getDate() + 1);
    if (getDayType(next)) return next;
  }

  return null;
}

export function getDisplayDayInfo(now) {
  const type = getDayType(now);

  if (type && secondsIntoDay(now) < (schoolEndSeconds[type] || 0))
    return { date: now, type, relation: "today" };

  const date = getNextSchoolDay(now);

  return { date, type: date && getDayType(date), relation: "next" };
}

export function getCurrentPeriod(type, seconds) {
  return (
    schedules[type]?.find(
      (period) => seconds >= period.startSeconds && seconds < period.endSeconds
    ) || null
  );
}

export function displayName(block) {
  return getCustomName(block.id) || block.name;
}

export function getSchedule(type) {
  return schedules[type] || [];
}

export function getLunches(type) {
  return lunches[type] || [];
}

export function getDisplaySchedule(type) {
  return displaySchedules[type] || [];
}

export function getSchoolEndSeconds(type) {
  return schoolEndSeconds[type] || 0;
}
