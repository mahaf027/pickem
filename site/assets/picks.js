import {
  api,
  escapeHtml,
  formatKickoff,
  logoUrl,
  requireSession,
  showPageError,
  wireLogout
} from "./app.js";

if (requireSession()) {
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
    document.querySelector("[data-game-count]").textContent = `${data.games.length} games`;
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
    status.textContent = "Saved";
    status.className = "saved-label";
  } catch (error) {
    status.textContent = error.message;
    status.className = "save-error";
  } finally {
    inputs.forEach((input) => { input.disabled = false; });
  }
}
