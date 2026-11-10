import { api, escapeHtml, showPageError } from "./app.js";
import { fetchPoolHistory } from "./history-data.js";

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
    const ties = data.weeks.filter((week) => week.result.leaders.length > 1);
    document.querySelector("[data-runoff-list]").innerHTML = ties.map((week) => runoffCard(week, data.rows)).join("");
    document.querySelector("[data-runoffs]").hidden = !ties.length;
  } catch (error) {
    loading.hidden = true;
    showPageError(error.message);
  }
}

export function historyTable({ season, weeks, rows }) {
  return `<table class="history-table">
    <caption class="sr-only">${season} regular season correct picks for every pool member</caption>
    <thead><tr><th scope="col" class="history-player">Player</th>
      ${weeks.map((week) => `<th scope="col">W${week.number}<small>${week.complete ? "Final" : week.completed ? `Live · ${week.completed}/${week.games}` : week.games ? "Upcoming" : "—"}</small></th>`).join("")}
    </tr></thead>
    <tbody>${rows.map((row) => `<tr class="${row.isCurrentUser ? "current-player" : ""}">
      <th scope="row" class="history-player"><a class="player-link" href="?id=${encodeURIComponent(row.id)}">${escapeHtml(row.username)}</a>${row.isCurrentUser ? '<small>You</small>' : !row.joined ? '<small>Not joined yet</small>' : ""}</th>
      ${weeks.map((week, index) => scoreCell(row, week, index)).join("")}
    </tr>`).join("")}</tbody>
  </table>`;
}

function scoreCell(row, week, index) {
  const { result } = week;
  const winner = result.winners.includes(row.id);
  const tied = result.leaders.length > 1 && result.leaders.includes(row.id);
  const awaitingRunoff = result.status === "runoff" && result.rounds.at(-1).contenders.includes(row.id);
  const type = winner ? result.status : tied ? (awaitingRunoff ? "runoff" : "tied") : "";
  const symbol = { won: "★", split: "÷", runoff: "↗", tied: "=" }[type];
  const label = { won: "Winner", split: "Split win", runoff: "Runoff pending", tied: "Tied for first; runoff eliminated" }[type];
  const score = row.scores[index] ?? "—";
  const content = `<strong>${score}</strong>${symbol ? `<span class="score-marker" aria-hidden="true">${symbol}</span><span class="sr-only"> · ${label}</span>` : ""}`;
  return `<td class="${type ? `result-${type}` : ""}">${tied ? `<a href="#runoff-${week.number}" aria-label="Week ${week.number}: ${score} correct picks. ${label}. View tiebreaker details">${content}</a>` : `<span class="history-score">${content}</span>`}</td>`;
}

function runoffCard(week, rows) {
  const names = (ids) => ids.map((id) => escapeHtml(rows.find((row) => row.id === id).username)).join(", ");
  const result = week.result;
  const outcome = result.status === "runoff" ? "Runoff pending" : result.status === "split" ? `Split win: ${names(result.winners)}` : `Winner: ${names(result.winners)}`;
  return `<article class="runoff-card" id="runoff-${week.number}" tabindex="-1">
    <div class="runoff-heading"><h3>Week ${week.number}</h3><span class="result-label result-${result.status}">${outcome}</span></div>
    <p><strong>Tied for first:</strong> ${names(result.leaders)} · ${rows.find((row) => row.id === result.leaders[0]).scores[week.number - 1]} correct picks each.</p>
    <ol>${result.rounds.map((round) => `<li><strong>Week ${round.number} runoff:</strong> ${round.scores
      ? `${round.scores.map((entry) => `${names([entry.id])}: ${entry.score}`).join(" · ")}. ${round.contenders.length === 1 ? `${names(round.contenders)} wins.` : `Still tied: ${names(round.contenders)}.`}`
      : `Awaiting final results for ${names(round.contenders)}.`}</li>`).join("")}</ol>
    ${result.status === "split" ? '<p>The remaining tie is split at the end of Week 18.</p>' : ""}
  </article>`;
}
