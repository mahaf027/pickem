import test from "node:test";
import assert from "node:assert/strict";
import { fetchPoolHistory, resolveWeeklyWinner } from "../assets/history-data.js";

function fixture(scores, incomplete = []) {
  const weeks = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, complete: scores[0][index] !== undefined && !incomplete.includes(index + 1) }));
  const rows = scores.map((values, index) => ({ id: index + 1, scores: values }));
  return { weeks, rows, resolve: (number) => resolveWeeklyWinner(weeks, rows, number - 1) };
}

test("an unfinished week cannot award a win even with a clear live leader", () => {
  assert.equal(fixture([[12], [10]], [1]).resolve(1).status, "pending");
});

test("a sole weekly leader wins immediately", () => {
  const result = fixture([[12], [10]]).resolve(1);
  assert.equal(result.status, "won");
  assert.deepEqual(result.winners, [1]);
  assert.deepEqual(result.rounds, []);
});

test("runoffs exclude everyone outside the original tie and remain separate contests", () => {
  const data = fixture([[12, 8], [12, 10], [11, 14]]);
  assert.deepEqual(data.resolve(1).winners, [2]);
  assert.deepEqual(data.resolve(2).winners, [3]);
});

test("successive runoffs eliminate losers permanently", () => {
  const result = fixture([[12, 10, 8], [12, 10, 9], [12, 9, 15]]).resolve(1);
  assert.deepEqual(result.winners, [2]);
  assert.deepEqual(result.rounds[0].contenders, [1, 2]);
  assert.deepEqual(result.rounds[1].scores.map((entry) => entry.id), [1, 2]);
});

test("live and missing runoff weeks await final results without skipping weeks", () => {
  const result = fixture([[12, 10], [12, 8]], [2]).resolve(1);
  assert.equal(result.status, "runoff");
  assert.deepEqual(result.winners, []);
  assert.equal(result.rounds[0].number, 2);
  assert.equal(result.rounds[0].scores, null);
  assert.equal(fixture([[12], [12]]).resolve(1).status, "runoff");
});

test("Week 18 ties and unresolved prior runoffs split among remaining players", () => {
  const scores = Array.from({ length: 3 }, () => Array(18).fill(10));
  scores[2][17] = 9;
  const data = fixture(scores);
  assert.equal(data.resolve(18).status, "split");
  assert.deepEqual(data.resolve(18).winners, [1, 2]);
  assert.equal(data.resolve(1).status, "split");
  assert.deepEqual(data.resolve(1).winners, [1, 2]);
  assert.equal(data.resolve(1).rounds.length, 17);
});

test("a Week 17 tie can resolve to one winner in Week 18", () => {
  const scores = [Array(18).fill(10), Array(18).fill(10)];
  scores[0][17] = 11;
  assert.deepEqual(fixture(scores).resolve(17).winners, [1]);
});

test("empty pools never award wins", () => {
  assert.equal(resolveWeeklyWinner([{ complete: true, number: 1 }], [], 0).status, "pending");
});

function leaderboardFixture() {
  const weeks = [
    { id: 3, number: 3, season: 2026, seasonType: 2 },
    { id: 2, number: 2, season: 2026, seasonType: 2 },
    { id: 1, number: 1, season: 2026, seasonType: 2 },
    { id: 99, number: 1, season: 2025, seasonType: 2 },
    { id: 100, number: 1, season: 2026, seasonType: 1 }
  ];
  const members = [
    { id: 1, username: "Alice", joined: true, isCurrentUser: true },
    { id: 2, username: "Bob", joined: true, isCurrentUser: false },
    { id: 3, username: "Unclaimed", joined: false, isCurrentUser: false }
  ];
  const boards = new Map(weeks.slice(0, 3).map((week) => [week.id, {
    week, weeks, seasonRows: members,
    games: [{ completed: true }, { completed: week.number !== 3 }],
    rows: members.map((member) => ({ ...member, score: member.id === 3 ? 0 : week.number === 2 && member.id === 1 ? 1 : 2 }))
  }]));
  const calls = [];
  const request = async (path) => {
    calls.push(path);
    const id = new URL(path, "https://example.test").searchParams.get("weekId");
    return boards.get(id ? Number(id) : 3);
  };
  return { boards, calls, request };
}

test("existing leaderboard responses provide all scores and runoff results without new endpoints", async () => {
  const { calls, request } = leaderboardFixture();
  const data = await fetchPoolHistory(request);
  assert.deepEqual(calls.sort(), ["/api/leaderboard", "/api/leaderboard?weekId=1", "/api/leaderboard?weekId=2"]);
  assert.equal(data.season, 2026);
  assert.equal(data.weeks.length, 18);
  assert.deepEqual(data.rows[0].scores.slice(0, 4), [2, 1, 2, null]);
  assert.deepEqual(data.weeks[0].result.leaders, [1, 2]);
  assert.deepEqual(data.weeks[0].result.winners, [2]);
  assert.equal(data.weeks[2].complete, false);
  assert.equal(data.weeks[2].result.status, "pending");
  assert.equal(data.weeks[3].games, 0);
  assert.equal(data.rows[2].joined, false);
  assert.equal(data.rows[0].isCurrentUser, true);
});

test("a season with no schedule still includes the whole roster", async () => {
  const data = await fetchPoolHistory(async () => ({ week: null, weeks: [], games: [], rows: [], seasonRows: [{ id: 1, username: "Alice", joined: true }] }));
  assert.equal(data.rows.length, 1);
  assert.ok(data.rows[0].scores.every((score) => score === null));
  assert.ok(data.weeks.every((week) => week.result.status === "pending"));
});

test("a failed weekly request rejects the table instead of reporting false zero scores", async () => {
  const { request } = leaderboardFixture();
  await assert.rejects(fetchPoolHistory((path) => {
    if (path.includes("weekId=1")) throw new Error("Network unavailable");
    return request(path);
  }), /Network unavailable/);
});

test("stale week links cannot silently substitute a different week's scores", async () => {
  const { boards, request } = leaderboardFixture();
  await assert.rejects(fetchPoolHistory((path) => path.includes("weekId=1") ? boards.get(3) : request(path)), /week list changed/);
});
