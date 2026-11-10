import test from "node:test";
import assert from "node:assert/strict";
import { buildTieTrails } from "../assets/history-data.js";

const example = [
  ["Andrew", [12, 11, 8, 9, 9, 9, 9, 10, 14]],
  ["Brian", [11, 11, 8, 11, 8, 8, 9, 9, 14]],
  ["Nate", [11, 12, 8, 9, 9, 7, 9, 10, 13]],
  ["Owen", [12, 11, 8, 8, 12, 7, 9, 8, 14]],
  ["Ryan", [8, 8, 9, 9, 8, 6, 9, 7, 13]],
  ["Theo", [9, 10, 8, 12, 9, 7, 9, 10, 14]],
  ["Will", [9, 10, 7, 13, 8, 7, 9, 5, 14]]
];

function fixture(extraWeeks = [], incomplete = []) {
  const rows = example.map(([username, scores], index) => ({ id: username, username, scores: [...scores, ...extraWeeks.map((week) => week[index])] }));
  const weeks = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, complete: index < rows[0].scores.length && !incomplete.includes(index + 1) }));
  return { season: 2026, rows, weeks, ...buildTieTrails(weeks, rows) };
}

test("the supplied table keeps the original yellow trail through Andrew's Week 4 runoff win", () => {
  const { trails, cells } = fixture();
  const first = trails.find((trail) => trail.id === 1);
  assert.equal(first.color, 0);
  assert.equal(first.decidedWeek, 4);
  assert.deepEqual(first.contenders, ["Andrew"]);
  assert.deepEqual(cells.Andrew.slice(0, 4).map((cell) => cell.trailIds), [[1], [1], [1], [1]]);
  assert.deepEqual(cells.Owen[3].trailIds, []);
  assert.deepEqual(cells.Andrew[3].resolved, [1]);
  assert.equal(cells.Andrew[3].outright, false);
  assert.equal(cells.Will[3].outright, true);
  assert.deepEqual(cells.Will[3].trailIds, []);
});

test("Weeks 7 and 8 share one yellow trail while Week 9 starts the orange trail", () => {
  const { trails, cells } = fixture();
  const yellow = trails.find((trail) => trail.id === 7);
  const orange = trails.find((trail) => trail.id === 9);
  assert.deepEqual(yellow.weeks, [7, 8]);
  assert.deepEqual(yellow.contenders, ["Andrew", "Theo"]);
  assert.equal(yellow.color, 0);
  assert.equal(orange.color, 1);
  assert.deepEqual(orange.contenders, ["Andrew", "Brian", "Owen", "Theo", "Will"]);
  assert.deepEqual(cells.Andrew[8].trailIds, [7, 9]);
  assert.deepEqual(cells.Theo[8].trailIds, [7, 9]);
  assert.deepEqual(cells.Nate[7].trailIds, [7]);
  assert.deepEqual(cells.Nate[8].trailIds, []);
  assert.deepEqual(cells.Brian[8].trailIds, [9]);
  assert.equal(cells.Andrew[8].outright, false);
});

test("existing trails retain both colors after converging and award one plus each", () => {
  const data = fixture([[15, 14, 14, 14, 13, 15, 14], [16, 14, 14, 14, 13, 15, 14]]);
  const { trails, cells } = data;
  assert.deepEqual(trails.find((trail) => trail.id === 7).weeks, [7, 8, 10]);
  assert.deepEqual(trails.find((trail) => trail.id === 9).weeks, [9]);
  assert.deepEqual(cells.Andrew[9].trailIds, [7, 9]);
  assert.deepEqual(cells.Theo[9].trailIds, [7, 9]);
  assert.deepEqual(cells.Andrew[10].resolved, [7, 9]);
  assert.equal(cells.Andrew[10].outright, true);
  assert.deepEqual(cells.Theo[10].trailIds, []);
});

test("three simultaneous trails can resolve alongside an outright win in a four-color cell", () => {
  const { trails, cells } = fixture([[15, 14, 15, 14, 13, 15, 14], [16, 14, 14, 14, 13, 15, 14]]);
  assert.deepEqual(trails.slice(1).map((trail) => trail.color), [0, 1, 2]);
  assert.deepEqual(cells.Andrew[9].trailIds, [7, 9, 10]);
  assert.deepEqual(cells.Andrew[10].resolved, [7, 9, 10]);
  assert.equal(cells.Andrew[10].outright, true);
});

test("unfinished weeks cannot eliminate contenders, add colors, stars or pluses", () => {
  const { trails, cells } = fixture([], [9]);
  assert.equal(trails.length, 2);
  assert.deepEqual(trails.at(-1).contenders, ["Andrew", "Nate", "Theo"]);
  for (const row of Object.values(cells)) assert.deepEqual(row[8], { trailIds: [], outright: false, resolved: [], split: false });
});

test("Week 18 splits keep trail colors and do not add runoff-win pluses", () => {
  const { rows, weeks } = fixture();
  for (const row of rows) row.scores = Array(18).fill(10);
  for (const week of weeks) week.complete = true;
  const { trails, cells } = buildTieTrails(weeks, rows);
  assert.equal(trails.length, 1);
  assert.equal(trails[0].weeks.length, 18);
  assert.equal(trails[0].status, "split");
  assert.deepEqual(cells.Andrew[17].trailIds, [1]);
  assert.equal(cells.Andrew[17].split, true);
  assert.deepEqual(cells.Andrew[17].resolved, []);
});

test("table rendering includes half fills, four-color fills and the correct star/plus counts", async () => {
  // app.js updates footer years on import; no browser is needed to render the table.
  globalThis.document = { querySelectorAll: () => [] };
  const { historyTable } = await import("../assets/history.js");
  delete globalThis.document;
  const html = historyTable(fixture());
  assert.doesNotMatch(html, /href="#runoff-/);
  assert.match(html, /linear-gradient\(135deg, #ffe69b 0% 50%, #f6bc8c 50% 100%\)/);
  assert.match(html, /<strong>9<\/strong><span class="score-marker" aria-hidden="true">\+<\/span>/);
  const four = historyTable(fixture([[15, 14, 15, 14, 13, 15, 14], [16, 14, 14, 14, 13, 15, 14]]));
  assert.match(four, /#b6d5a5 0% 25%, #ffe69b 25% 50%, #f6bc8c 50% 75%, #c7a68a 75% 100%/);
  assert.match(four, /<strong>16<\/strong><span class="score-marker" aria-hidden="true">★\+\+\+<\/span>/);
  const grey = historyTable(fixture([[15, 14, 15, 14, 13, 15, 14], [16, 15, 15, 15, 16, 16, 15]]));
  assert.match(grey, /#cccccc 75% 100%/);
  assert.match(grey, /Grey trail for Week 11/);
});
