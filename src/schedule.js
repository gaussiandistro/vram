import { supabase } from "./supabase.js";
import { dateKey, secondsIntoDay } from "./time.js";

const DEFAULT_WEEK_PATTERN = { 1: "Blue", 2: "White", 3: "RAM", 4: "Blue", 5: "White" };

let weekPattern = DEFAULT_WEEK_PATTERN;
let dayExceptions = {};
let noSchoolDates = new Set();
let schedules = {};
let lunches = {};
let schoolEndSeconds = {};
let displaySchedules = {};

function secondsFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60 + minutes) * 60;
}

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

export async function loadScheduleData() {
  if (!supabase) return;

  const [
    { data: types, error: typesError },
    { data: blocks, error: blocksError },
    { data: dates, error: datesError },
    { data: defaults, error: defaultsError },
  ] = await Promise.all([
    supabase.from("schedule_types").select("id, name").eq("active", true),
    supabase
      .from("schedule_blocks")
      .select("block_id, name, kind, start_time, end_time, sort_order, schedule_types!inner(name)")
      .order("sort_order"),
    supabase
      .from("calendar_dates")
      .select("date, is_school_day, schedule_type:schedule_types(name)"),
    supabase
      .from("schedule_defaults")
      .select("weekday, schedule_type:schedule_types(name)")
      .order("weekday"),
  ]);

  const firstError = typesError || blocksError || datesError || defaultsError;
  if (firstError) throw firstError;

  const nextSchedules = Object.fromEntries((types || []).map((type) => [type.name, []]));
  const nextLunches = Object.fromEntries((types || []).map((type) => [type.name, []]));

  for (const block of blocks || []) {
    const type = Array.isArray(block.schedule_types)
      ? block.schedule_types[0]
      : block.schedule_types;

    const target = block.kind === "lunch" ? nextLunches : nextSchedules;
    if (!type || !target[type.name]) continue;

    const start = block.start_time.slice(0, 5);
    const end = block.end_time.slice(0, 5);

    target[type.name].push({
      id: block.block_id,
      name: block.name,
      kind: block.kind,
      start,
      end,
      startSeconds: secondsFromTime(start),
      endSeconds: secondsFromTime(end),
    });
  }

  for (const schedule of Object.values(nextSchedules))
    schedule.sort((a, b) => a.startSeconds - b.startSeconds);

  for (const lunch of Object.values(nextLunches))
    lunch.sort((a, b) => a.startSeconds - b.startSeconds);

  const nextExceptions = {};
  const nextNoSchool = new Set();

  for (const entry of dates || []) {
    const type = Array.isArray(entry.schedule_type) ? entry.schedule_type[0] : entry.schedule_type;
    if (entry.is_school_day && type) nextExceptions[entry.date] = type.name;
    else if (!entry.is_school_day) nextNoSchool.add(entry.date);
  }

  if (defaults && defaults.length > 0) {
    const nextPattern = {};
    for (const row of defaults) {
      const type = Array.isArray(row.schedule_type) ? row.schedule_type[0] : row.schedule_type;
      if (type) nextPattern[row.weekday] = type.name;
    }
    if (Object.keys(nextPattern).length > 0) weekPattern = nextPattern;
  }

  schedules = nextSchedules;
  lunches = nextLunches;
  dayExceptions = nextExceptions;
  noSchoolDates = nextNoSchool;

  rebuildScheduleIndexes();
}

export function getDayType(date) {
  const key = dateKey(date);
  if (noSchoolDates.has(key)) return null;
  const type = dayExceptions[key] || weekPattern[date.getDay()];
  return schedules[type] ? type : null;
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

export function getNextPeriod(type, seconds) {
  return schedules[type]?.find((period) => period.startSeconds > seconds) || null;
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
