import { escapeHtml } from "./app.js";

export function renderSeasonStandings(rows, season) {
  const target = document.querySelector("[data-season-leaderboard]");
  const root = document.body.dataset.root || "./";
  document.querySelector("[data-season-label]").textContent = `${season} regular season`;
  target.innerHTML = `
    <table class="season-table">
      <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Correct picks</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr class="${row.isCurrentUser ? "current-player" : ""}">
          <td>${row.rank}</td>
          <th scope="row">${row.rank === 1 ? `<img class="leader-crown" src="${root}assets/images/crown.png" alt="Season leader">` : ""}${standingsPlayerName(row, root)}</th>
          <td><strong>${row.correct}</strong></td>
        </tr>`).join("")}</tbody>
    </table>`;
  target.hidden = false;
}

export function standingsPlayerName(row, root = "") {
  const tag = row.isCurrentUser
    ? " <small>You</small>"
    : row.joined === false ? ' <small class="muted-tag">Not joined yet</small>' : "";
  return `<a class="player-link" href="${root}player/?id=${encodeURIComponent(row.id)}">${escapeHtml(row.username)}</a>${tag}`;
}
