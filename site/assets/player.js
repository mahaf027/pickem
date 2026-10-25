import {
  api,
  currentUser,
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
  const playerId = new URLSearchParams(location.search).get("id") || currentUser()?.id;
  if (String(playerId) === String(currentUser()?.id)) {
    document.querySelector("[data-history-link]").setAttribute("aria-current", "page");
  }
  loadHistory(playerId);
}

async function loadHistory(playerId) {
  const loading = document.querySelector("[data-loading]");
  const list = document.querySelector("[data-history]");
  try {
    const data = await api(`/api/players/${encodeURIComponent(playerId)}`);
    loading.hidden = true;
    renderHeading(data);
    const weeks = data.weeks.filter((entry) => entry.games > 0);
    if (!weeks.length) {
      document.querySelector("[data-empty]").hidden = false;
      return;
    }
    list.innerHTML = weeks.map((entry, index) => weekRow(entry, index === 0)).join("");
    list.hidden = false;
  } catch (error) {
    loading.hidden = true;
    showPageError(error.message);
  }
}

function renderHeading(data) {
  const { player } = data;
  document.title = `${player.username} | Mahaffey Mutiny Pick'em`;
  document.querySelector("[data-player-name]").textContent = player.username;
  document.querySelector("[data-player-eyebrow]").textContent = player.isCurrentUser ? "Your history" : "Player history";
  document.querySelector("[data-season-label]").textContent = `${data.season} season`;
  const chips = [`<span class="stat-chip"><strong>${data.seasonCorrect}</strong> correct this season</span>`];
  if (player.splashName) chips.push(`<span class="stat-chip">Splash: ${escapeHtml(player.splashName)}</span>`);
  if (!player.joined) chips.push('<span class="stat-chip muted">Not joined yet</span>');
  const stats = document.querySelector("[data-player-stats]");
  stats.innerHTML = chips.join("");
  stats.hidden = false;
}

function weekRow(entry, open) {
  const score = entry.correct === null
    ? '<span class="week-score muted">Hidden until Sunday</span>'
    : `<span class="week-score"><strong>${entry.correct}</strong>/${entry.decided || entry.games}</span>`;
  const rank = entry.rank ? `<span class="week-rank">#${entry.rank} of ${entry.players}</span>` : "";
  const source = entry.fromSplash ? '<span class="source-tag">Splash</span>' : "";
  const body = entry.visible
    ? `<div class="history-picks">${entry.picks.map(historyPick).join("")}</div>`
    : `<p class="history-hidden">Picks unlock ${escapeHtml(formatKickoff(entry.week.revealAt))}.</p>`;
  return `
    <details class="history-week" ${open ? "open" : ""}>
      <summary>
        <span class="week-name">${escapeHtml(entry.week.label)}</span>
        ${source}
        <span class="week-result">${rank}${score}</span>
      </summary>
      ${body}
    </details>`;
}

function historyPick({ game, pick }) {
  const team = [game.awayTeam, game.homeTeam].find((candidate) => candidate.id === pick?.teamId);
  const state = pick ? pick.state : "none";
  const logo = team ? logoUrl(team.abbreviation) : "";
  const label = team ? team.abbreviation : pick ? "Missed" : "—";
  return `
    <div class="history-pick pick-${escapeHtml(state)}" title="${escapeHtml(game.awayTeam.name)} at ${escapeHtml(game.homeTeam.name)}">
      <small>${escapeHtml(game.awayTeam.abbreviation)} @ ${escapeHtml(game.homeTeam.abbreviation)}</small>
      <span class="pick-pill">
        ${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy">` : ""}
        <strong>${escapeHtml(label)}</strong>
        ${pick?.automatic ? '<small class="auto-label">Auto</small>' : ""}
      </span>
    </div>`;
}
