import test from "node:test";
import assert from "node:assert/strict";
import {
  canSubmitPick,
  getPickWeekWindow,
  pickDeadline,
  pickState,
  shouldImportSchedule,
  zonedTimeToUtc
} from "../src/domain.js";

test("Monday 9 PM Pacific advances to the next Tuesday window", () => {
  const before = getPickWeekWindow("2026-09-14T03:59:00Z");
  const after = getPickWeekWindow("2026-09-15T04:01:00Z");
  assert.equal(before.startDate, "2026-09-08");
  assert.equal(after.startDate, "2026-09-15");
});

test("Sunday reveal time honors daylight saving time", () => {
  assert.equal(getPickWeekWindow("2026-09-17T12:00:00Z").revealAt.toISOString(), "2026-09-20T17:00:00.000Z");
  assert.equal(getPickWeekWindow("2026-11-05T12:00:00Z").revealAt.toISOString(), "2026-11-08T18:00:00.000Z");
});

test("a game kickoff can close before the Sunday deadline", () => {
  const reveal = zonedTimeToUtc({ year: 2026, month: 9, day: 20, hour: 10 });
  const thursday = new Date("2026-09-18T00:15:00Z");
  const sunday = new Date("2026-09-20T20:00:00Z");
  assert.equal(pickDeadline(thursday, reveal).toISOString(), thursday.toISOString());
  assert.equal(pickDeadline(sunday, reveal).toISOString(), reveal.toISOString());
  assert.equal(canSubmitPick("2026-09-18T00:16:00Z", thursday, reveal), false);
});

test("pick result states distinguish wins, losses, ties, and live games", () => {
  assert.equal(pickState({ selectedTeamId: "1", winnerTeamId: "1", completed: true }), "win");
  assert.equal(pickState({ selectedTeamId: "1", winnerTeamId: "2", completed: true }), "loss");
  assert.equal(pickState({ selectedTeamId: "1", winnerTeamId: null, completed: true }), "tie");
  assert.equal(pickState({ selectedTeamId: "1", winnerTeamId: null, completed: false }), "pending");
});

test("schedule import guard only opens after Monday 9 PM Pacific", () => {
  assert.equal(shouldImportSchedule("2026-09-15T03:59:00Z", "2026-09-08"), false);
  assert.equal(shouldImportSchedule("2026-09-15T04:01:00Z", "2026-09-08"), true);
  assert.equal(shouldImportSchedule("2026-09-15T04:01:00Z", "2026-09-15"), false);
});
