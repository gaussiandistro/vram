// kinda late, but it still works for this window
export const SEASONS = [
  {
    id: "halloween",
    label: "Halloween",
    start: [10, 1],
    end: [10, 31],
    mode: "dark",
  },
  {
    id: "jackolantern",
    label: "Jack-o'-lantern",
    secret: true,
    unlock: "pumpkinPact",
    mode: "dark",
  },
];

export function getSeason(id) {
  return SEASONS.find((season) => season.id === id) ?? null;
}

function windowKeys(season) {
  return {
    start: season.start[0] * 100 + season.start[1],
    end: season.end[0] * 100 + season.end[1],
  };
}

function isWithinWindow(date, season) {
  const { start, end } = windowKeys(season);
  const today = (date.getMonth() + 1) * 100 + date.getDate();

  return start <= end ? today >= start && today <= end : today >= start || today <= end;
}

export function getActiveSeason(date) {
  return SEASONS.find((season) => !season.secret && isWithinWindow(date, season)) ?? null;
}

export function resolveSeasonId(preference, date) {
  if (preference === "off") return null;

  if (preference && preference !== "auto") {
    const season = getSeason(preference);

    if (season) return season.id;
  }

  return getActiveSeason(date)?.id ?? null;
}
