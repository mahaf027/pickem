const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function pacificParts(input) {
  const date = input instanceof Date ? input : new Date(input);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday]
  };
}

export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const rendered = pacificParts(new Date(guess));
  const renderedAsUtc = Date.UTC(
    rendered.year,
    rendered.month - 1,
    rendered.day,
    rendered.hour,
    rendered.minute,
    rendered.second
  );
  return new Date(guess - (renderedAsUtc - guess));
}

export function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function isoDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function compactDate(parts) {
  return isoDate(parts).replaceAll("-", "");
}

export function getPickWeekWindow(input) {
  const now = input instanceof Date ? input : new Date(input);
  const local = pacificParts(now);
  const mondayAfterCutover = local.weekday === 1 && local.hour >= 21;
  const daysSinceTuesday = (local.weekday + 5) % 7;
  const start = mondayAfterCutover
    ? addCalendarDays(local, 1)
    : addCalendarDays(local, -daysSinceTuesday);
  const end = addCalendarDays(start, 6);
  const sunday = addCalendarDays(start, 5);
  const revealAt = zonedTimeToUtc({ ...sunday, hour: 10 });
  return {
    start,
    end,
    startDate: isoDate(start),
    endDate: isoDate(end),
    espnDates: `${compactDate(start)}-${compactDate(end)}`,
    revealAt
  };
}

export function pickDeadline(startTime, revealAt) {
  const kickoff = new Date(startTime);
  const reveal = new Date(revealAt);
  return kickoff < reveal ? kickoff : reveal;
}

export function pickState({ selectedTeamId, winnerTeamId, completed }) {
  if (!completed) return "pending";
  if (!winnerTeamId) return "tie";
  return selectedTeamId === winnerTeamId ? "win" : "loss";
}

export function canSubmitPick(now, startTime, revealAt) {
  return new Date(now) < pickDeadline(startTime, revealAt);
}

export function shouldImportSchedule(now, lastImportedStartDate) {
  const local = pacificParts(now);
  if (local.weekday !== 1 || local.hour < 21) return false;
  return getPickWeekWindow(now).startDate !== lastImportedStartDate;
}
