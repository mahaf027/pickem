import {
  canSubmitPick,
  getPickWeekWindow,
  pickDeadline,
  pickState,
  shouldImportSchedule,
  zonedTimeToUtc
} from "../src/domain.js";

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

const before = getPickWeekWindow("2026-09-15T03:59:00Z");
const after = getPickWeekWindow("2026-09-15T04:01:00Z");
equal(before.startDate, "2026-09-08", "window before Monday cutover");
equal(after.startDate, "2026-09-15", "window after Monday cutover");
equal(after.revealAt.toISOString(), "2026-09-20T17:00:00.000Z", "DST reveal time");

const reveal = zonedTimeToUtc({ year: 2026, month: 9, day: 20, hour: 10 });
const thursday = new Date("2026-09-18T00:15:00Z");
equal(pickDeadline(thursday, reveal).toISOString(), thursday.toISOString(), "early game deadline");
equal(canSubmitPick("2026-09-18T00:16:00Z", thursday, reveal), false, "locked kickoff");
equal(pickState({ selectedTeamId: "1", winnerTeamId: "1", completed: true }), "win", "winning pick");
equal(pickState({ selectedTeamId: "1", winnerTeamId: "2", completed: true }), "loss", "losing pick");
equal(shouldImportSchedule("2026-09-15T04:01:00Z", "2026-09-08"), true, "Monday import gate");

if (typeof print === "function") print("domain smoke tests: OK");
