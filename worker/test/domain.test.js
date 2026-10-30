import test from "node:test";
import assert from "node:assert/strict";
import {
  canSubmitPick,
  getPickWeekWindow,
  getWeekWindowFromStart,
  isPickVisible,
  normalizeTeamAbbreviation,
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

test("early-game picks become visible at their kickoff", () => {
  const deadline = "2026-09-18T00:15:00Z";
  assert.equal(isPickVisible("2026-09-18T00:14:59Z", deadline), false);
  assert.equal(isPickVisible("2026-09-18T00:15:00Z", deadline), true);
  assert.equal(isPickVisible("2026-09-18T00:14:59Z", deadline, true), true);
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

test("historical week windows preserve Tuesday through Monday boundaries", () => {
  const window = getWeekWindowFromStart({ year: 2026, month: 10, day: 13 });
  assert.equal(window.startDate, "2026-10-13");
  assert.equal(window.endDate, "2026-10-19");
  assert.equal(window.espnDates, "20261013-20261019");
  assert.equal(window.revealAt.toISOString(), "2026-10-18T17:00:00.000Z");
});

test("Splash team abbreviations normalize to ESPN abbreviations", () => {
  assert.equal(normalizeTeamAbbreviation(" was "), "WSH");
  assert.equal(normalizeTeamAbbreviation("JAC"), "JAX");
  assert.equal(normalizeTeamAbbreviation("LA"), "LAR");
  assert.equal(normalizeTeamAbbreviation("kc"), "KC");
  assert.equal(normalizeTeamAbbreviation("WSH"), "WSH");
});
