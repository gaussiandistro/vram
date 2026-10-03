import { loadStorage, saveStorage } from "./storage.js";

const CLOCK_STORAGE_KEY = "vram-clock";

export let clockFormat = loadStorage(CLOCK_STORAGE_KEY) === "24" ? "24" : "12";
export let simulatedNow = null;
export let simulatedRealTime = 0;

export function saveClockFormat() {
  saveStorage(CLOCK_STORAGE_KEY, clockFormat);
}

export function setClockFormat(format) {
  clockFormat = format === "24" ? "24" : "12";
  saveClockFormat();
}

export function currentDateTime() {
  return simulatedNow
    ? new Date(simulatedNow.getTime() + Date.now() - simulatedRealTime)
    : new Date();
}

export function applySimulatedTime(date) {
  simulatedNow = date;
  simulatedRealTime = Date.now();
}

export function resetSimulatedTime() {
  simulatedNow = null;
  simulatedRealTime = 0;
}
