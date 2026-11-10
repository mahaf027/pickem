import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("History loads successfully with the runoff section removed", async () => {
  const html = await readFile(new URL("../player/index.html", import.meta.url), "utf8");
  const elements = new Map([...html.matchAll(/\b(data-[a-z-]+)(?=[\s=>])/g)].map(([, name]) => [
    `[${name}]`, { hidden: true, innerHTML: "", classList: { add() {} }, setAttribute() {} }
  ]));
  assert.equal(elements.has("[data-runoff-list]"), false);
  const original = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.document = { querySelector: (selector) => elements.get(selector) || null, querySelectorAll: () => [] };
  globalThis.localStorage = { getItem: () => null };
  const week = { id: 1, number: 1, season: 2026, seasonType: 2 };
  const rows = [{ id: 1, username: "Andrew", score: 12 }, { id: 2, username: "Theo", score: 12 }];
  globalThis.fetch = async () => Response.json({ week, weeks: [week], rows, seasonRows: rows, games: [{ completed: true }] });
  try {
    // Load the exact version referenced by the page's entry module.
    const { loadPoolHistory } = await import("../assets/history.js?v=history-table-2");
    await loadPoolHistory();
    assert.equal(elements.get("[data-page-error]").hidden, true);
    assert.equal(elements.get("[data-history]").hidden, false);
    assert.equal(elements.get("[data-history-key]").hidden, false);
    assert.match(elements.get("[data-history]").innerHTML, /Andrew/);
    assert.doesNotMatch(elements.get("[data-history]").innerHTML, /href="#runoff-/);
  } finally {
    Object.assign(globalThis, original);
  }
});
