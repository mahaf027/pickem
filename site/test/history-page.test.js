import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("History renders the Leaderboard's YTD standings and the weekly history", async () => {
  const html = await readFile(new URL("../player/index.html", import.meta.url), "utf8");
  const elements = new Map([...html.matchAll(/\b(data-[a-z-]+)(?=[\s=>])/g)].map(([, name]) => [
    `[${name}]`, { hidden: true, innerHTML: "", classList: { add() {} }, setAttribute() {} }
  ]));
  assert.equal(elements.has("[data-runoff-list]"), false);
  const original = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.document = {
    body: { dataset: { root: "../" } },
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: () => []
  };
  globalThis.localStorage = { getItem: () => null };
  const week = { id: 1, number: 1, season: 2026, seasonType: 2 };
  const rows = [{ id: 1, username: "Andrew", score: 12 }, { id: 2, username: "Theo", score: 12 }];
  const seasonRows = [{ ...rows[1], rank: 1, correct: 129, isCurrentUser: true }, { ...rows[0], rank: 2, correct: 125 }];
  globalThis.fetch = async () => Response.json({ week, weeks: [week], rows, seasonRows, games: [{ completed: true }] });
  try {
    // Load the exact version referenced by the page's entry module.
    const { loadPoolHistory } = await import("../assets/history.js?v=history-table-4");
    await loadPoolHistory();
    assert.equal(elements.get("[data-page-error]").hidden, true);
    assert.equal(elements.get("[data-history]").hidden, false);
    assert.equal(elements.get("[data-history-key]").hidden, false);
    const standings = elements.get("[data-season-leaderboard]");
    assert.equal(standings.hidden, false);
    assert.equal(elements.get("[data-season-label]").textContent, "2026 regular season");
    assert.match(standings.innerHTML, /class="current-player"[\s\S]*?src="\.\.\/assets\/images\/crown\.png"[^>]*>.*href="\.\.\/player\/\?id=2">Theo<\/a> <small>You<\/small>[\s\S]*?<strong>129<\/strong>[\s\S]*?Andrew[\s\S]*?<strong>125<\/strong>/);
    assert.match(elements.get("[data-history]").innerHTML, /Andrew/);
    assert.doesNotMatch(elements.get("[data-history]").innerHTML, /href="#runoff-/);
  } finally {
    Object.assign(globalThis, original);
  }
});
