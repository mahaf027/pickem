import {
  api,
  escapeHtml,
  formatKickoff,
  logoUrl,
  requireSession,
  showPageError,
  wireLogout
} from "./app.js";

let games = [];
let picks = {};

initialize();

async function initialize() {
  if (!(await requireSession())) return;
  wireLogout();
  loadPicks();
}

async function loadPicks() {
  const loading = document.querySelector("[data-loading]");
  const empty = document.querySelector("[data-empty]");
  const list = document.querySelector("[data-games]");
  try {
    const data = await api("/api/picks");
    loading.hidden = true;
    if (!data.week || !data.games.length) {
      empty.hidden = false;
      return;
    }
    document.querySelector("[data-week-label]").textContent = `${data.week.label} · ${data.week.season}`;
    games = data.games;
    picks = data.picks;
    renderProgress();
    startCountdown();
    document.querySelector("[data-reveal-time]").textContent = formatKickoff(data.week.revealAt);
    list.innerHTML = data.games.map((game, index) => gameCard(game, data.picks[game.id], index)).join("");
    list.hidden = false;
    list.addEventListener("change", saveSelection);
  } catch (error) {
    loading.hidden = true;
    showPageError(error.message);
  }
}

function gameCard(game, pick, index) {
  const locked = !game.canPick;
  const auto = pick?.automatic ? '<span class="auto-badge">Auto pick</span>' : "";
  return `
    <article class="game-card" data-game-id="${escapeHtml(game.id)}">
      <header class="game-meta">
        <span>Game ${index + 1}</span>
        <time datetime="${escapeHtml(game.startTime)}">${escapeHtml(formatKickoff(game.startTime))}</time>
        ${locked ? '<span class="locked-badge">Locked</span>' : ""}
      </header>
      <div class="team-options">
        ${teamOption(game, game.awayTeam, "Away", pick, locked)}
        <span class="at-mark">@</span>
        ${teamOption(game, game.homeTeam, "Home", pick, locked)}
      </div>
      <footer class="game-footer">
        <span>${escapeHtml(game.status)}</span>
        <span data-save-status>${auto}</span>
      </footer>
    </article>`;
}

function teamOption(game, team, location, pick, locked) {
  const checked = pick?.teamId === team.id ? "checked" : "";
  const disabled = locked ? "disabled" : "";
  const logo = logoUrl(team.abbreviation);
  return `
    <label class="team-option">
      <input type="radio" name="game-${escapeHtml(game.id)}" value="${escapeHtml(team.id)}" ${checked} ${disabled}>
      <span class="team-choice">
        <small>${location}</small>
        ${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy">` : ""}
        <strong>${escapeHtml(team.abbreviation)}</strong>
        <span>${escapeHtml(team.name)}</span>
      </span>
    </label>`;
}

async function saveSelection(event) {
  if (!event.target.matches("input[type='radio']")) return;
  const card = event.target.closest("[data-game-id]");
  const status = card.querySelector("[data-save-status]");
  const inputs = card.querySelectorAll("input");
  inputs.forEach((input) => { input.disabled = true; });
  status.textContent = "Saving…";
  try {
    await api(`/api/picks/${encodeURIComponent(card.dataset.gameId)}`, {
      method: "PUT",
      body: JSON.stringify({ teamId: event.target.value })
    });
    picks[card.dataset.gameId] = { teamId: event.target.value, automatic: false };
    renderProgress();
    status.textContent = "Saved ✓";
    status.className = "saved-label";
  } catch (error) {
    status.textContent = error.message;
    status.className = "save-error";
  } finally {
    inputs.forEach((input) => { input.disabled = false; });
  }
}

function renderProgress() {
  const made = games.filter((game) => picks[game.id] && !picks[game.id].automatic).length;
  const label = document.querySelector("[data-game-count]");
  const open = games.some((game) => new Date(game.deadline) > new Date());
  label.textContent = open ? `${made} of ${games.length} picked` : "Week locked";
  label.classList.toggle("complete", made === games.length);
}

function startCountdown() {
  const target = document.querySelector("[data-countdown]");
  const update = () => {
    const now = Date.now();
    const next = games
      .map((game) => new Date(game.deadline).getTime())
      .filter((deadline) => deadline > now)
      .sort((a, b) => a - b)[0];
    if (!next) {
      target.textContent = "All games locked";
    } else {
      const open = games.filter((game) => new Date(game.deadline).getTime() === next).length;
      target.textContent = `${open === 1 ? "Next game locks" : `${open} games lock`} in ${timeUntil(next - now)}`;
    }
    target.hidden = false;
  };
  update();
  setInterval(update, 30000);
}

function timeUntil(ms) {
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}
