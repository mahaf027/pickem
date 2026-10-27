import {
  api,
  escapeHtml,
  formatKickoff,
  logoUrl,
  requireSession,
  showPageError,
  wireLogout
} from "./app.js";

let currentData = null;

initialize();

async function initialize() {
  if (!(await requireSession())) return;
  wireLogout();
  const requestedWeek = new URLSearchParams(location.search).get("week");
  loadLeaderboard(requestedWeek);
}

async function loadLeaderboard(weekId = null) {
  const loading = document.querySelector("[data-loading]");
  const empty = document.querySelector("[data-empty]");
  const board = document.querySelector("[data-leaderboard]");
  const error = document.querySelector("[data-page-error]");
  loading.hidden = false;
  empty.hidden = true;
  board.hidden = true;
  error.hidden = true;
  try {
    const query = weekId ? `?weekId=${encodeURIComponent(weekId)}` : "";
    const data = await api(`/api/leaderboard${query}`);
    currentData = data;
    loading.hidden = true;
    renderSeasonStandings(data.seasonRows || []);
    if (!data.week || !data.games.length) {
      empty.hidden = false;
      return;
    }
    renderWeekNavigation(data);
    const visibility = document.querySelector("[data-pick-visibility]");
    visibility.textContent = data.picksRevealed
      ? (data.fromSplash ? "Imported from Splash Sports" : "All picks are visible")
      : `Other players’ picks unlock ${formatKickoff(data.week.revealAt)}`;
    board.innerHTML = leaderboardTable(data);
    board.hidden = false;
    const url = new URL(location.href);
    url.searchParams.set("week", data.week.id);
    history.replaceState({}, "", url);
  } catch (error) {
    loading.hidden = true;
    showPageError(error.message);
  }
}

function renderWeekNavigation(data) {
  const select = document.querySelector("[data-week-select]");
  const older = document.querySelector("[data-older-week]");
  const newer = document.querySelector("[data-newer-week]");
  select.innerHTML = data.weeks.map((week) => `
    <option value="${week.id}" ${week.id === data.week.id ? "selected" : ""}>
      ${escapeHtml(week.label)} · ${week.season}
    </option>`).join("");
  const index = data.weeks.findIndex((week) => week.id === data.week.id);
  older.disabled = index < 0 || index === data.weeks.length - 1;
  newer.disabled = index <= 0;
  older.dataset.weekId = older.disabled ? "" : data.weeks[index + 1].id;
  newer.dataset.weekId = newer.disabled ? "" : data.weeks[index - 1].id;
  document.querySelector("[data-week-controls]").hidden = false;
}

document.querySelector("[data-week-select]").addEventListener("change", (event) => {
  loadLeaderboard(event.target.value);
});

document.querySelectorAll("[data-week-direction]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.weekId) loadLeaderboard(button.dataset.weekId);
  });
});

function renderSeasonStandings(rows) {
  const target = document.querySelector("[data-season-leaderboard]");
  const season = currentData?.week?.season || new Date().getFullYear();
  document.querySelector("[data-season-label]").textContent = `${season} regular season`;
  target.innerHTML = `
    <table class="season-table">
      <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Correct picks</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr class="${row.isCurrentUser ? "current-player" : ""}">
          <td>${row.rank}</td>
          <th scope="row">${row.rank === 1 ? '<img class="leader-crown" src="assets/images/crown.png" alt="Season leader">' : ""}${playerName(row)}</th>
          <td><strong>${row.correct}</strong></td>
        </tr>`).join("")}</tbody>
    </table>`;
  target.hidden = false;
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
    <th class="player-column" scope="row">${playerName(row)}</th>
    <td class="score-column">${row.score}</td>
    ${games.map((game) => pickCell(row.picks[game.id], teamById)).join("")}
  </tr>`;
}

function playerName(row) {
  const tag = row.isCurrentUser
    ? " <small>You</small>"
    : row.joined === false ? ' <small class="muted-tag">Not joined yet</small>' : "";
  return `<a class="player-link" href="player/?id=${row.id}">${escapeHtml(row.username)}</a>${tag}`;
}

function pickCell(pick, teamById) {
  if (!pick) return '<td class="pick-cell pick-hidden"><span>—</span></td>';
  const team = teamById.get(pick.teamId);
  // A blank team id is a pick missed on Splash; it counts as a loss.
  if (!team) return `<td class="pick-cell pick-${escapeHtml(pick.state)}"><div class="pick-pill"><strong>Missed</strong></div></td>`;
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
