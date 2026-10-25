import {
  api,
  escapeHtml,
  formatKickoff,
  logoUrl,
  requireSession,
  showPageError,
  wireLogout
} from "./app.js";

initialize();

async function initialize() {
  if (!(await requireSession())) return;
  wireLogout();
  loadLeaderboard();
}

async function loadLeaderboard() {
  const loading = document.querySelector("[data-loading]");
  const empty = document.querySelector("[data-empty]");
  const board = document.querySelector("[data-leaderboard]");
  try {
    const data = await api("/api/leaderboard");
    loading.hidden = true;
    if (!data.week || !data.games.length) {
      empty.hidden = false;
      return;
    }
    document.querySelector("[data-week-label]").textContent = `${data.week.label} · ${data.week.season}`;
    const visibility = document.querySelector("[data-pick-visibility]");
    visibility.textContent = data.picksRevealed
      ? "All picks are visible"
      : `Other players’ picks unlock ${formatKickoff(data.week.revealAt)}`;
    board.innerHTML = leaderboardTable(data);
    board.hidden = false;
  } catch (error) {
    loading.hidden = true;
    showPageError(error.message);
  }
}

function leaderboardTable(data) {
  const teamById = new Map();
  data.games.forEach((game) => {
    teamById.set(game.awayTeam.id, game.awayTeam);
    teamById.set(game.homeTeam.id, game.homeTeam);
  });
  return `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th class="rank-column" scope="col">Rank</th>
          <th class="player-column" scope="col">Player</th>
          <th class="score-column" scope="col">Score</th>
          ${data.games.map(gameHeader).join("")}
        </tr>
      </thead>
      <tbody>
        ${data.rows.map((row) => playerRow(row, data.games, teamById)).join("")}
      </tbody>
    </table>`;
}

function gameHeader(game) {
  return `<th class="game-column" scope="col" title="${escapeHtml(game.awayTeam.name)} at ${escapeHtml(game.homeTeam.name)}">
    <span>${escapeHtml(game.awayTeam.abbreviation)} @ ${escapeHtml(game.homeTeam.abbreviation)}</span>
    <small>${escapeHtml(shortDate(game.startTime))}</small>
  </th>`;
}

function playerRow(row, games, teamById) {
  return `<tr class="${row.isCurrentUser ? "current-player" : ""}">
    <td class="rank-column">${row.rank}</td>
    <th class="player-column" scope="row">${escapeHtml(row.username)}${row.isCurrentUser ? " <small>You</small>" : ""}</th>
    <td class="score-column">${row.score}</td>
    ${games.map((game) => pickCell(row.picks[game.id], teamById)).join("")}
  </tr>`;
}

function pickCell(pick, teamById) {
  if (!pick) return '<td class="pick-cell pick-hidden"><span>—</span></td>';
  const team = teamById.get(pick.teamId);
  if (!team) return '<td class="pick-cell"><span>—</span></td>';
  const logo = logoUrl(team.abbreviation);
  return `<td class="pick-cell pick-${escapeHtml(pick.state)}">
    <div class="pick-pill">
      ${pick.automatic ? '<small class="auto-label">Auto</small>' : ""}
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy">` : ""}
      <strong>${escapeHtml(team.abbreviation)}</strong>
    </div>
  </td>`;
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "numeric",
    day: "numeric"
  }).format(new Date(value));
}
