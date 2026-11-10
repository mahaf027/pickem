import { api, escapeHtml, showPageError } from "./app.js";
import { buildTieTrails, fetchPoolHistory } from "./history-data.js";

export async function loadPoolHistory() {
  const loading = document.querySelector("[data-loading]");
  try {
    const data = await fetchPoolHistory(api);
    document.querySelector("[data-season-label]").textContent = `${data.season} regular season`;
    loading.hidden = true;
    if (!data.rows.length || !data.weeks.some((week) => week.games)) {
      document.querySelector("[data-empty]").hidden = false;
      return;
    }
    const target = document.querySelector("[data-history]");
    target.classList.add("history-table-wrap");
    target.tabIndex = 0;
    target.setAttribute("role", "region");
    target.setAttribute("aria-label", "Weekly win totals, scroll horizontally for all weeks");
    target.innerHTML = historyTable(data);
    target.hidden = false;
    document.querySelector("[data-history-key]").hidden = false;
  } catch (error) {
    loading.hidden = true;
    showPageError(error.message);
  }
}

export function historyTable({ season, weeks, rows, trails, cells }) {
  if (!trails || !cells) ({ trails, cells } = buildTieTrails(weeks, rows));
  return `<table class="history-table">
    <caption class="sr-only">${season} regular season correct picks for every pool member</caption>
    <thead><tr><th scope="col" class="history-player">Player</th>
      ${weeks.map((week) => `<th scope="col">W${week.number}<small>${week.complete ? "Final" : week.completed ? `Live · ${week.completed}/${week.games}` : week.games ? "Upcoming" : "—"}</small></th>`).join("")}
    </tr></thead>
    <tbody>${rows.map((row) => `<tr class="${row.isCurrentUser ? "current-player" : ""}">
      <th scope="row" class="history-player"><a class="player-link" href="?id=${encodeURIComponent(row.id)}">${escapeHtml(row.username)}</a>${row.isCurrentUser ? '<small>You</small>' : !row.joined ? '<small>Not joined yet</small>' : ""}</th>
      ${weeks.map((week, index) => scoreCell(row, week, index, trails, cells[row.id][index])).join("")}
    </tr>`).join("")}</tbody>
  </table>`;
}

const TRAIL_COLORS = ["#ffe69b", "#f6bc8c", "#c7a68a", "#cccccc"];
const TRAIL_NAMES = ["Yellow", "Orange", "Brown", "Grey"];
const trailColor = (trail) => TRAIL_COLORS[trail.color] || `hsl(${(trail.color * 137.5) % 360} 45% 78%)`;
const trailName = (trail) => TRAIL_NAMES[trail.color] || `Trail ${trail.color + 1}`;
const weekNames = (trail) => `${trail.weeks.length > 1 ? "Weeks" : "Week"} ${trail.weeks.join(" + ")}`;

export function cellBackground(colors) {
  if (!colors.length) return "";
  if (colors.length === 1) return colors[0];
  return `linear-gradient(135deg, ${colors.map((color, index) => `${color} ${index * 100 / colors.length}% ${(index + 1) * 100 / colors.length}%`).join(", ")})`;
}

function scoreCell(row, week, index, trails, cell) {
  const memberships = cell.trailIds.map((id) => trails.find((trail) => trail.id === id));
  const colors = [...(cell.outright ? ["#b6d5a5"] : []), ...memberships.map(trailColor)];
  const symbols = `${cell.outright ? "★" : ""}${"+".repeat(cell.resolved.length)}${cell.split ? "÷" : ""}`;
  const details = [
    ...(cell.outright ? ["Outright weekly winner"] : []),
    ...memberships.map((trail) => `${trailName(trail)} trail for ${weekNames(trail)}${cell.resolved.includes(trail.id) ? `: runoff won, ${trail.weeks.length} weekly ${trail.weeks.length === 1 ? "win" : "wins"}` : cell.split ? ": split at Week 18" : ": tied contender"}`)
  ].join(". ");
  const score = row.scores[index] ?? "—";
  const content = `<strong>${score}</strong>${symbols ? `<span class="score-marker" aria-hidden="true">${symbols}</span>` : ""}`;
  const label = escapeHtml(`Week ${week.number}: ${score} correct picks${details ? `. ${details}` : ""}`);
  return `<td${colors.length ? ` class="trail-cell" style="background: ${cellBackground(colors)}"` : ""} title="${label}"><span class="history-score" aria-label="${label}">${content}</span></td>`;
}
