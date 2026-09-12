export function secondsFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60 + minutes) * 60;
}

export function timeFromSeconds(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function secondsIntoDay(date) {
  return (
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds() +
    date.getMilliseconds() / 1000
  );
}

export function formatClock(time, clockFormat) {
  const [hoursString, minutes] = time.split(":");
  const hours = Number(hoursString);
  if (clockFormat === "24") return `${String(hours).padStart(2, "0")}:${minutes}`;
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatDuration(seconds) {
  const total = Math.ceil(Math.max(0, seconds));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function formatShortDuration(seconds) {
  const total = Math.ceil(Math.max(0, seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function toInputDate(date) {
  return dateKey(date);
}

export function toInputTime(date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
