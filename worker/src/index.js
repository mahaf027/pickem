import {
  addCalendarDays,
  getPickWeekWindow,
  getWeekWindowFromStart,
  isoDate,
  normalizeTeamAbbreviation,
  pacificParts,
  pickDeadline,
  pickState,
  shouldImportSchedule
} from "./domain.js";

const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, "") || "/";

      if (path === "/" || path === "/api/health") {
        return json({ ok: true, service: "mahaffey-pickem-api" }, 200, cors);
      }

      if (path === "/api/pool/unlock" && request.method === "POST") {
        return await unlockPool(request, env, cors);
      }

      if (path === "/api/auth/register" && request.method === "POST") {
        return await register(request, env, cors);
      }

      if (path === "/api/auth/login" && request.method === "POST") {
        return await login(request, env, cors);
      }

      if (path === "/api/splash-names" && request.method === "GET") {
        await requirePoolToken(request, env);
        const { results } = await env.DB.prepare(
          `SELECT splash_name FROM users
            WHERE splash_name IS NOT NULL AND claimed_at IS NULL
            ORDER BY splash_name COLLATE NOCASE`
        ).all();
        return json({ names: results.map((row) => row.splash_name) }, 200, cors);
      }

      if (path === "/api/admin/passwords" && request.method === "GET") {
        requireAdmin(request, env);
        const { results } = await env.DB.prepare(
          `SELECT username, password_plain AS password, splash_name, created_at
             FROM users WHERE claimed_at IS NOT NULL ORDER BY username COLLATE NOCASE`
        ).all();
        return json({ accounts: results }, 200, cors);
      }

      if (path === "/api/admin/sync" && request.method === "POST") {
        requireAdmin(request, env);
        const result = await runMaintenance(env, new Date(), true);
        return json(result, 200, cors);
      }

      if (path === "/api/admin/import-splash" && request.method === "POST") {
        requireAdmin(request, env);
        return json(await importSplash(await readJson(request), env), 200, cors);
      }

      if (path === "/api/admin/link" && request.method === "POST") {
        requireAdmin(request, env);
        return json(await linkSplashName(await readJson(request), env), 200, cors);
      }

      if (path === "/api/admin/unclaim" && request.method === "POST") {
        requireAdmin(request, env);
        return json(await unclaimSplashName(await readJson(request), env), 200, cors);
      }

      const user = await authenticate(request, env);

      if (path === "/api/me" && request.method === "GET") {
        return json({ user: publicUser(user) }, 200, cors);
      }

      if (path === "/api/auth/logout" && request.method === "POST") {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(bearerToken(request)).run();
        return json({ ok: true }, 200, cors);
      }

      if (path === "/api/picks" && request.method === "GET") {
        return await getPicks(user, env, cors);
      }

      if (path.startsWith("/api/picks/") && request.method === "PUT") {
        return await savePick(path.slice("/api/picks/".length), user, request, env, cors);
      }

      if (path === "/api/leaderboard" && request.method === "GET") {
        return await getLeaderboard(user, env, cors, url.searchParams.get("weekId"));
      }

      if (path.startsWith("/api/players/") && request.method === "GET") {
        return await getPlayerHistory(path.slice("/api/players/".length), user, env, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (error) {
      console.error(error);
      const status = error.status || 500;
      const isAuthorizedAdmin = Boolean(
        env.ADMIN_TOKEN && request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN
      );
      const message = status === 500 && !isAuthorizedAdmin
        ? "The server could not complete that request."
        : error.message;
      return json({ error: message }, status, cors);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runMaintenance(env, new Date(controller.scheduledTime)));
  }
};

async function unlockPool(request, env, cors) {
  const { password } = await readJson(request);
  if (password !== (env.POOL_PASSWORD || "Mutiny")) {
    throw httpError(401, "That pool password is not correct.");
  }
  if (!env.AUTH_SECRET) {
    throw httpError(503, "The backend is missing AUTH_SECRET.");
  }
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = base64Url(encoder.encode(JSON.stringify({ scope: "pool", expiresAt })));
  const signature = await sign(payload, env.AUTH_SECRET);
  return json({ poolToken: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() }, 200, cors);
}

async function register(request, env, cors) {
  await requirePoolToken(request, env);
  const { username, password, splashName } = await readJson(request);
  validateCredentials(username, password);

  try {
    let userId;
    if (splashName) {
      // Claiming a Splash name turns the imported placeholder row into this account.
      const claimed = await env.DB.prepare(
        `UPDATE users SET username = ?, password_plain = ?, claimed_at = CURRENT_TIMESTAMP
          WHERE splash_name = ? AND claimed_at IS NULL RETURNING id`
      ).bind(username.trim(), password, String(splashName).trim()).first();
      if (!claimed) throw httpError(409, "That Splash name has already been claimed. Ask the pool organizer for help.");
      userId = claimed.id;
    } else {
      const result = await env.DB.prepare(
        "INSERT INTO users (username, password_plain, claimed_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
      ).bind(username.trim(), password).run();
      userId = result.meta.last_row_id;
    }
    const user = await env.DB.prepare("SELECT id, username, splash_name, created_at FROM users WHERE id = ?")
      .bind(userId).first();
    const session = await createSession(user.id, env);
    await applyAutomaticPicks(env, new Date(), user.id);
    return json({ user: publicUser(user), ...session }, 201, cors);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw httpError(409, "That username is already taken.");
    }
    throw error;
  }
}

async function login(request, env, cors) {
  await requirePoolToken(request, env);
  const { username, password } = await readJson(request);
  const user = await env.DB.prepare(
    `SELECT id, username, password_plain, splash_name, created_at FROM users
      WHERE username = ? COLLATE NOCASE AND claimed_at IS NOT NULL`
  ).bind(String(username || "").trim()).first();
  if (!user || !user.password_plain || user.password_plain !== password) {
    throw httpError(401, "Username or password is incorrect.");
  }
  const session = await createSession(user.id, env);
  return json({ user: publicUser(user), ...session }, 200, cors);
}

async function getPicks(user, env, cors) {
  await applyAutomaticPicks(env, new Date(), user.id);
  const week = await currentWeek(env);
  if (!week) return json({ week: null, games: [], picks: {} }, 200, cors);

  const { results: games } = await env.DB.prepare(
    `SELECT id, start_time, deadline, away_team_id, away_team_abbreviation, away_team_name,
            home_team_id, home_team_abbreviation, home_team_name, away_score, home_score,
            status, completed, winner_team_id
       FROM games WHERE week_id = ? ORDER BY start_time, id`
  ).bind(week.id).all();
  const { results: picks } = await env.DB.prepare(
    `SELECT p.game_id, p.selected_team_id, p.is_auto
       FROM picks p JOIN games g ON g.id = p.game_id
      WHERE p.user_id = ? AND g.week_id = ?`
  ).bind(user.id, week.id).all();
  const now = new Date();

  return json({
    week: publicWeek(week),
    games: games.map((game) => ({
      ...publicGame(game),
      canPick: now < new Date(game.deadline)
    })),
    picks: Object.fromEntries(picks.map((pick) => [pick.game_id, {
      teamId: pick.selected_team_id,
      automatic: Boolean(pick.is_auto)
    }]))
  }, 200, cors);
}

async function savePick(gameId, user, request, env, cors) {
  const { teamId } = await readJson(request);
  const game = await env.DB.prepare(
    `SELECT id, deadline, away_team_id, home_team_id FROM games WHERE id = ?`
  ).bind(gameId).first();
  if (!game) throw httpError(404, "Game not found.");
  if (new Date() >= new Date(game.deadline)) {
    throw httpError(409, "The deadline for this game has passed.");
  }
  if (![game.away_team_id, game.home_team_id].includes(String(teamId))) {
    throw httpError(400, "Select one of the teams in this game.");
  }

  await env.DB.prepare(
    `INSERT INTO picks (user_id, game_id, selected_team_id, is_auto)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       selected_team_id = excluded.selected_team_id,
       is_auto = 0,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(user.id, game.id, String(teamId)).run();
  return json({ ok: true, gameId: game.id, teamId: String(teamId) }, 200, cors);
}

async function getLeaderboard(user, env, cors, requestedWeekId = null) {
  await applyAutomaticPicks(env, new Date());
  const { results: weeks } = await env.DB.prepare(
    "SELECT * FROM weeks ORDER BY window_start DESC"
  ).all();
  // Unknown week ids (stale links) fall back to the latest week.
  const week = weeks.find((candidate) => String(candidate.id) === String(requestedWeekId)) || weeks[0];

  const season = week?.season || new Date().getFullYear();
  const { results: seasonAccounts } = await env.DB.prepare(
    `SELECT u.id, u.username, u.claimed_at, u.splash_name, COALESCE(scores.correct, 0) AS correct
       FROM users u
       LEFT JOIN (
         SELECT p.user_id, COUNT(*) AS correct
           FROM picks p
           JOIN games g ON g.id = p.game_id
           JOIN weeks w ON w.id = g.week_id
          WHERE w.season = ? AND w.season_type = 2
            AND g.completed = 1 AND g.winner_team_id = p.selected_team_id
          GROUP BY p.user_id
       ) scores ON scores.user_id = u.id
      ORDER BY correct DESC, u.username COLLATE NOCASE`
  ).bind(season).all();
  const seasonRows = rankSeasonRows(seasonAccounts, user.id);

  if (!week) {
    return json({ week: null, weeks: [], games: [], rows: [], seasonRows, picksRevealed: false }, 200, cors);
  }

  const { results: games } = await env.DB.prepare(
    `SELECT id, start_time, deadline, away_team_id, away_team_abbreviation, away_team_name,
            home_team_id, home_team_abbreviation, home_team_name, away_score, home_score,
            status, completed, winner_team_id
       FROM games WHERE week_id = ? ORDER BY start_time, id`
  ).bind(week.id).all();
  const picksRevealed = new Date() >= new Date(week.reveal_at);
  const { results: accounts } = await env.DB.prepare(
    "SELECT id, username, claimed_at, splash_name FROM users ORDER BY username COLLATE NOCASE"
  ).all();
  const { results: allPicks } = await env.DB.prepare(
    `SELECT p.user_id, p.game_id, p.selected_team_id, p.is_auto, p.source
       FROM picks p JOIN games g ON g.id = p.game_id WHERE g.week_id = ?`
  ).bind(week.id).all();

  const picksByUser = new Map();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.user_id)) picksByUser.set(pick.user_id, new Map());
    picksByUser.get(pick.user_id).set(pick.game_id, pick);
  }

  const rows = accounts.map((account) => {
    const userPicks = picksByUser.get(account.id) || new Map();
    const visible = picksRevealed || account.id === user.id;
    let score = 0;
    const picks = {};
    for (const game of games) {
      const pick = userPicks.get(game.id);
      if (!pick || !visible) continue;
      const state = pickState({
        selectedTeamId: pick.selected_team_id,
        winnerTeamId: game.winner_team_id,
        completed: Boolean(game.completed)
      });
      if (state === "win") score += 1;
      picks[game.id] = {
        teamId: pick.selected_team_id,
        automatic: Boolean(pick.is_auto),
        state
      };
    }
    return {
      id: account.id,
      username: account.username,
      joined: Boolean(account.claimed_at),
      score,
      isCurrentUser: account.id === user.id,
      picks
    };
  });

  rows.sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  let priorScore = null;
  let priorRank = 0;
  rows.forEach((row, index) => {
    row.rank = row.score === priorScore ? priorRank : index + 1;
    priorScore = row.score;
    priorRank = row.rank;
  });

  return json({
    week: publicWeek(week),
    weeks: weeks.map(publicWeek),
    games: games.map(publicGame),
    rows,
    seasonRows,
    picksRevealed,
    fromSplash: allPicks.some((pick) => pick.source === "splash")
  }, 200, cors);
}

async function getPlayerHistory(playerId, user, env, cors) {
  await applyAutomaticPicks(env, new Date());
  const player = await env.DB.prepare(
    "SELECT id, username, claimed_at, splash_name FROM users WHERE id = ?"
  ).bind(playerId).first();
  if (!player) throw httpError(404, "Player not found.");

  const latest = await currentWeek(env);
  const season = latest?.season || new Date().getFullYear();
  const { results: weeks } = await env.DB.prepare(
    "SELECT * FROM weeks WHERE season = ? ORDER BY window_start DESC"
  ).bind(season).all();
  const { results: games } = await env.DB.prepare(
    `SELECT g.id, g.week_id, g.start_time, g.deadline, g.away_team_id, g.away_team_abbreviation,
            g.away_team_name, g.home_team_id, g.home_team_abbreviation, g.home_team_name,
            g.away_score, g.home_score, g.status, g.completed, g.winner_team_id
       FROM games g JOIN weeks w ON w.id = g.week_id
      WHERE w.season = ? ORDER BY g.start_time, g.id`
  ).bind(season).all();
  const { results: picks } = await env.DB.prepare(
    `SELECT p.game_id, p.selected_team_id, p.is_auto, p.source
       FROM picks p JOIN games g ON g.id = p.game_id JOIN weeks w ON w.id = g.week_id
      WHERE p.user_id = ? AND w.season = ?`
  ).bind(player.id, season).all();
  // Correct picks for every player in every week, used for weekly ranks.
  const { results: weekScores } = await env.DB.prepare(
    `SELECT g.week_id, p.user_id,
            SUM(CASE WHEN g.completed = 1 AND g.winner_team_id = p.selected_team_id THEN 1 ELSE 0 END) AS correct
       FROM picks p JOIN games g ON g.id = p.game_id JOIN weeks w ON w.id = g.week_id
      WHERE w.season = ?
      GROUP BY g.week_id, p.user_id`
  ).bind(season).all();

  const now = new Date();
  const isSelf = player.id === user.id;
  const pickByGame = new Map(picks.map((pick) => [pick.game_id, pick]));
  const history = weeks.map((week) => {
    const weekGames = games.filter((game) => game.week_id === week.id);
    const revealed = now >= new Date(week.reveal_at);
    const visible = revealed || isSelf;
    const scores = weekScores.filter((row) => row.week_id === week.id).map((row) => Number(row.correct));
    let correct = 0;
    let decided = 0;
    const gamePicks = weekGames.map((game) => {
      const pick = pickByGame.get(game.id);
      if (!pick || !visible) return { game: publicGame(game), pick: null };
      const state = pickState({
        selectedTeamId: pick.selected_team_id,
        winnerTeamId: game.winner_team_id,
        completed: Boolean(game.completed)
      });
      if (state === "win") correct += 1;
      if (state !== "pending") decided += 1;
      return {
        game: publicGame(game),
        pick: { teamId: pick.selected_team_id, automatic: Boolean(pick.is_auto), state }
      };
    });
    return {
      week: publicWeek(week),
      revealed,
      visible,
      fromSplash: weekGames.some((game) => pickByGame.get(game.id)?.source === "splash"),
      games: weekGames.length,
      correct: visible ? correct : null,
      decided: visible ? decided : null,
      rank: revealed ? 1 + scores.filter((score) => score > correct).length : null,
      players: scores.length,
      picks: gamePicks
    };
  });

  return json({
    player: {
      id: player.id,
      username: player.username,
      joined: Boolean(player.claimed_at),
      splashName: player.splash_name,
      isCurrentUser: isSelf
    },
    season,
    seasonCorrect: history
      .filter((entry) => entry.week.seasonType === 2 && entry.correct !== null)
      .reduce((total, entry) => total + entry.correct, 0),
    weeks: history
  }, 200, cors);
}

async function importSplash(body, env) {
  const season = Number(body?.season);
  if (!Number.isInteger(season) || !Array.isArray(body?.weeks)) {
    throw httpError(400, "Expected { season, weeks: [{ week, picks: { name: [teams] } }] }.");
  }

  const names = [...new Set(body.weeks.flatMap((week) => Object.keys(week.picks || {}))
    .map((name) => String(name).trim()).filter(Boolean))];
  const playerIds = new Map();
  for (const name of names) playerIds.set(name, await ensureSplashPlayer(name, env));

  const { results: games } = await env.DB.prepare(
    `SELECT g.id, w.week_number, g.away_team_id, g.away_team_abbreviation, g.home_team_id, g.home_team_abbreviation
       FROM games g JOIN weeks w ON w.id = g.week_id
      WHERE w.season = ? AND w.season_type = 2`
  ).bind(season).all();

  const report = { players: names.length, picks: 0, missed: 0, unmatched: [], missingWeeks: [] };
  const statements = [];
  const upsert = `INSERT INTO picks (user_id, game_id, selected_team_id, is_auto, source)
                  VALUES (?, ?, ?, 0, 'splash')
                  ON CONFLICT(user_id, game_id) DO UPDATE SET
                    selected_team_id = excluded.selected_team_id,
                    is_auto = 0,
                    source = 'splash',
                    updated_at = CURRENT_TIMESTAMP
                  WHERE picks.is_auto = 1 OR picks.source = 'splash'`;

  for (const entry of body.weeks) {
    const weekGames = games.filter((game) => game.week_number === Number(entry.week));
    if (!weekGames.length) {
      report.missingWeeks.push(entry.week);
      continue;
    }
    for (const name of names) {
      const chosen = new Map();
      for (const raw of entry.picks?.[name] || []) {
        const team = normalizeTeamAbbreviation(raw);
        const game = weekGames.find((candidate) =>
          [candidate.away_team_abbreviation, candidate.home_team_abbreviation]
            .map(normalizeTeamAbbreviation).includes(team));
        if (!game || chosen.has(game.id)) {
          report.unmatched.push({ week: entry.week, player: name, team: raw });
          continue;
        }
        chosen.set(game.id, normalizeTeamAbbreviation(game.away_team_abbreviation) === team
          ? game.away_team_id
          : game.home_team_id);
      }
      for (const game of weekGames) {
        // A game with no Splash pick is stored as a blank pick: it scores as a
        // loss, matching Splash, instead of getting an automatic away pick.
        const teamId = chosen.get(game.id) ?? "";
        if (teamId) report.picks += 1;
        else report.missed += 1;
        statements.push(env.DB.prepare(upsert).bind(playerIds.get(name), game.id, teamId));
      }
    }
  }

  for (let index = 0; index < statements.length; index += 100) {
    await env.DB.batch(statements.slice(index, index + 100));
  }
  return report;
}

async function ensureSplashPlayer(name, env) {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE splash_name = ?").bind(name).first();
  if (existing) return existing.id;
  const taken = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(name).first();
  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_plain, splash_name) VALUES (?, '', ?)"
  ).bind(taken ? `${name} (Splash)` : name, name).run();
  return result.meta.last_row_id;
}

async function linkSplashName({ username, splashName } = {}, env) {
  const account = await env.DB.prepare(
    "SELECT id, splash_name FROM users WHERE username = ? COLLATE NOCASE AND claimed_at IS NOT NULL"
  ).bind(String(username || "").trim()).first();
  if (!account) throw httpError(404, "No account has that username.");
  if (account.splash_name) throw httpError(409, `That account is already linked to ${account.splash_name}.`);
  const placeholder = await env.DB.prepare(
    "SELECT id FROM users WHERE splash_name = ? AND claimed_at IS NULL"
  ).bind(String(splashName || "").trim()).first();
  if (!placeholder) throw httpError(404, "No unclaimed Splash player has that name.");

  // Splash picks replace the account's automatic picks; picks made on the site are kept.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO picks (user_id, game_id, selected_team_id, is_auto, source)
       SELECT ?, game_id, selected_team_id, is_auto, source FROM picks WHERE user_id = ?
       ON CONFLICT(user_id, game_id) DO UPDATE SET
         selected_team_id = excluded.selected_team_id,
         is_auto = excluded.is_auto,
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP
       WHERE picks.is_auto = 1 OR picks.source = 'splash'`
    ).bind(account.id, placeholder.id),
    env.DB.prepare("DELETE FROM picks WHERE user_id = ?").bind(placeholder.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(placeholder.id),
    env.DB.prepare("UPDATE users SET splash_name = ? WHERE id = ?").bind(String(splashName).trim(), account.id)
  ]);
  return { ok: true, username: String(username).trim(), splashName: String(splashName).trim() };
}

async function unclaimSplashName({ splashName } = {}, env) {
  const name = String(splashName || "").trim();
  const account = await env.DB.prepare(
    "SELECT id FROM users WHERE splash_name = ? AND claimed_at IS NOT NULL"
  ).bind(name).first();
  if (!account) throw httpError(404, "No claimed account has that Splash name.");
  const taken = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?"
  ).bind(name, account.id).first();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET username = ?, password_plain = '', claimed_at = NULL WHERE id = ?"
    ).bind(taken ? `${name} (Splash)` : name, account.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(account.id)
  ]);
  return { ok: true, splashName: name };
}

async function runMaintenance(env, now = new Date(), forceImport = false) {
  const lastImport = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'last_schedule_window'").first();
  const weekCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM weeks").first();
  let imported = false;

  if (forceImport || Number(weekCount?.count || 0) === 0 || shouldImportSchedule(now, lastImport?.value)) {
    await importSchedule(env, now);
    imported = true;
  }

  const updatedGames = await syncResults(env, now);
  const backfilledWeek = await backfillOneHistoricalWeek(env);
  const automaticPicks = await applyAutomaticPicks(env, now);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  return { ok: true, imported, backfilledWeek, updatedGames, automaticPicks, ranAt: now.toISOString() };
}

async function importSchedule(env, now) {
  const window = getPickWeekWindow(now);
  return importScheduleWindow(env, window, true);
}

async function importScheduleWindow(env, window, markAsCurrent = false) {
  const data = await fetchScoreboard(window.espnDates);
  const events = data.events || [];
  if (!events.length) throw new Error(`No NFL games returned for ${window.startDate} through ${window.endDate}.`);

  const firstEvent = events[0];
  const season = Number(firstEvent.season?.year || data.season?.year || window.start.year);
  const seasonType = Number(firstEvent.season?.type || data.season?.type || 2);
  const weekNumber = Number(firstEvent.week?.number || data.week?.number || 0);
  const label = seasonType === 3 ? `Postseason ${weekNumber || ""}`.trim() : `Week ${weekNumber || ""}`.trim();

  await env.DB.prepare(
    `INSERT INTO weeks (season, season_type, week_number, label, window_start, window_end, reveal_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(window_start) DO UPDATE SET
       season = excluded.season,
       season_type = excluded.season_type,
       week_number = excluded.week_number,
       label = excluded.label,
       window_end = excluded.window_end,
       reveal_at = excluded.reveal_at,
       imported_at = CURRENT_TIMESTAMP`
  ).bind(
    season,
    seasonType,
    weekNumber,
    label,
    window.startDate,
    window.endDate,
    window.revealAt.toISOString()
  ).run();

  const week = await env.DB.prepare("SELECT id FROM weeks WHERE window_start = ?").bind(window.startDate).first();
  const statements = events.map((event) => upsertGameStatement(env, week.id, event, window.revealAt));
  if (statements.length) await env.DB.batch(statements);
  if (markAsCurrent) {
    await env.DB.prepare(
      `INSERT INTO system_state (key, value) VALUES ('last_schedule_window', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(window.startDate).run();
  }
  return { weekNumber, windowStart: window.startDate, games: events.length };
}

async function backfillOneHistoricalWeek(env) {
  const earliest = await env.DB.prepare(
    `SELECT * FROM weeks WHERE season_type = 2 ORDER BY window_start ASC LIMIT 1`
  ).first();
  if (!earliest || Number(earliest.week_number) <= 1) return null;

  const [year, month, day] = earliest.window_start.split("-").map(Number);
  const previousStart = addCalendarDays({ year, month, day }, -7);
  const result = await importScheduleWindow(env, getWeekWindowFromStart(previousStart));
  if (Number(result.weekNumber) >= Number(earliest.week_number)) {
    throw new Error(`Historical NFL data did not move backward from ${earliest.label}.`);
  }
  return result;
}

async function syncResults(env, now) {
  const localDate = isoDate(pacificParts(now));
  const { results: weeks } = await env.DB.prepare(
    `SELECT DISTINCT w.id, w.window_start, w.window_end
       FROM weeks w JOIN games g ON g.week_id = w.id
      WHERE g.completed = 0
        AND g.start_time <= ?
        AND g.start_time >= ?
        AND w.window_end >= date(?, '-8 days')`
  ).bind(now.toISOString(), new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(), localDate).all();
  let updated = 0;

  for (const week of weeks) {
    const data = await fetchScoreboard(`${week.window_start.replaceAll("-", "")}-${week.window_end.replaceAll("-", "")}`);
    const statements = (data.events || []).map((event) => updateResultStatement(env, event));
    if (statements.length) {
      await env.DB.batch(statements);
      updated += statements.length;
    }
  }
  return updated;
}

async function applyAutomaticPicks(env, now, userId = null) {
  const userClause = userId ? "AND u.id = ?" : "";
  const statement = env.DB.prepare(
    `INSERT OR IGNORE INTO picks (user_id, game_id, selected_team_id, is_auto)
     SELECT u.id, g.id, g.away_team_id, 1
       FROM users u CROSS JOIN games g
      WHERE g.deadline <= ? ${userClause}`
  );
  const result = userId
    ? await statement.bind(now.toISOString(), userId).run()
    : await statement.bind(now.toISOString()).run();
  return Number(result.meta?.changes || 0);
}

function upsertGameStatement(env, weekId, event, revealAt) {
  const game = normalizeEvent(event, revealAt);
  return env.DB.prepare(
    `INSERT INTO games (
       id, week_id, start_time, deadline,
       away_team_id, away_team_abbreviation, away_team_name,
       home_team_id, home_team_abbreviation, home_team_name,
       away_score, home_score, status, completed, winner_team_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       week_id = excluded.week_id,
       start_time = excluded.start_time,
       deadline = excluded.deadline,
       away_team_id = excluded.away_team_id,
       away_team_abbreviation = excluded.away_team_abbreviation,
       away_team_name = excluded.away_team_name,
       home_team_id = excluded.home_team_id,
       home_team_abbreviation = excluded.home_team_abbreviation,
       home_team_name = excluded.home_team_name,
       away_score = excluded.away_score,
       home_score = excluded.home_score,
       status = excluded.status,
       completed = excluded.completed,
       winner_team_id = excluded.winner_team_id,
       last_updated_at = CURRENT_TIMESTAMP`
  ).bind(
    game.id, weekId, game.startTime, game.deadline,
    game.awayTeam.id, game.awayTeam.abbreviation, game.awayTeam.name,
    game.homeTeam.id, game.homeTeam.abbreviation, game.homeTeam.name,
    game.awayScore, game.homeScore, game.status, game.completed ? 1 : 0, game.winnerTeamId
  );
}

function updateResultStatement(env, event) {
  const game = normalizeEvent(event, new Date("9999-12-31T00:00:00Z"));
  return env.DB.prepare(
    `UPDATE games SET away_score = ?, home_score = ?, status = ?, completed = ?,
      winner_team_id = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(game.awayScore, game.homeScore, game.status, game.completed ? 1 : 0, game.winnerTeamId, game.id);
}

function normalizeEvent(event, revealAt) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const away = competitors.find((team) => team.homeAway === "away");
  const home = competitors.find((team) => team.homeAway === "home");
  if (!competition || !away || !home) throw new Error(`Invalid event payload for ${event.id}.`);
  const completed = Boolean(competition.status?.type?.completed);
  const winner = competitors.find((team) => team.winner === true);
  const startTime = new Date(event.date).toISOString();
  return {
    id: String(event.id),
    startTime,
    deadline: pickDeadline(startTime, revealAt).toISOString(),
    awayTeam: teamFromCompetitor(away),
    homeTeam: teamFromCompetitor(home),
    awayScore: numericScore(away.score),
    homeScore: numericScore(home.score),
    status: competition.status?.type?.shortDetail || competition.status?.type?.description || "Scheduled",
    completed,
    winnerTeamId: completed && winner ? String(winner.team.id) : null
  };
}

function teamFromCompetitor(competitor) {
  return {
    id: String(competitor.team.id),
    abbreviation: competitor.team.abbreviation,
    name: competitor.team.displayName
  };
}

function numericScore(score) {
  if (score === undefined || score === null || score === "") return null;
  const value = Number(score);
  return Number.isFinite(value) ? value : null;
}

async function fetchScoreboard(dates) {
  const requestedDates = expandDateRange(dates);
  const responses = await Promise.all(requestedDates.map(async (date) => {
    const response = await fetch(`${ESPN_SCOREBOARD}?limit=100&dates=${date}`, {
      headers: { Accept: "application/json", "User-Agent": "mahaffey-pickem/1.0" }
    });
    if (!response.ok) {
      throw new Error(`NFL data provider returned ${response.status} for ${date}.`);
    }
    return response.json();
  }));

  const events = new Map();
  for (const response of responses) {
    for (const event of response.events || []) events.set(String(event.id), event);
  }
  return { ...(responses.find((response) => response.events?.length) || responses[0]), events: [...events.values()] };
}

function expandDateRange(value) {
  if (!value.includes("-")) return [value];
  const [startValue, endValue] = value.split("-");
  const parse = (compact) => new Date(Date.UTC(
    Number(compact.slice(0, 4)),
    Number(compact.slice(4, 6)) - 1,
    Number(compact.slice(6, 8))
  ));
  const start = parse(startValue);
  const end = parse(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new Error(`Invalid NFL schedule date range: ${value}.`);
  }
  const dates = [];
  for (let date = start; date <= end && dates.length < 14; date = new Date(date.getTime() + 86400000)) {
    dates.push(date.toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return dates;
}

async function currentWeek(env) {
  return env.DB.prepare("SELECT * FROM weeks ORDER BY window_start DESC LIMIT 1").first();
}

async function authenticate(request, env) {
  const token = bearerToken(request);
  if (!token) throw httpError(401, "Sign in to continue.");
  const user = await env.DB.prepare(
    `SELECT u.id, u.username, u.splash_name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ? AND u.claimed_at IS NOT NULL`
  ).bind(token, new Date().toISOString()).first();
  if (!user) throw httpError(401, "Your session has expired. Sign in again.");
  return user;
}

async function createSession(userId, env) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64Url(bytes);
  const days = Math.max(1, Number(env.SESSION_DAYS || 90));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt).run();
  return { token, expiresAt };
}

async function requirePoolToken(request, env) {
  const token = request.headers.get("X-Pool-Token");
  if (!token || !env.AUTH_SECRET) throw httpError(401, "Enter the pool password first.");
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !(await verify(payload, signature, env.AUTH_SECRET))) {
    throw httpError(401, "Pool access has expired. Enter the pool password again.");
  }
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    throw httpError(401, "Pool access is invalid.");
  }
  if (decoded.scope !== "pool" || decoded.expiresAt <= Date.now()) {
    throw httpError(401, "Pool access has expired. Enter the pool password again.");
  }
}

function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN || request.headers.get("X-Admin-Token") !== env.ADMIN_TOKEN) {
    throw httpError(403, "Admin access required.");
  }
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function verify(value, signature, secret) {
  const expected = await sign(value, secret);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function publicUser(user) {
  return { id: user.id, username: user.username, splashName: user.splash_name || null, createdAt: user.created_at };
}

function publicWeek(week) {
  return {
    id: week.id,
    season: week.season,
    seasonType: week.season_type,
    number: week.week_number,
    label: week.label,
    windowStart: week.window_start,
    windowEnd: week.window_end,
    revealAt: week.reveal_at
  };
}

function rankSeasonRows(accounts, currentUserId) {
  let priorScore = null;
  let priorRank = 0;
  return accounts.map((account, index) => {
    const correct = Number(account.correct || 0);
    const rank = correct === priorScore ? priorRank : index + 1;
    priorScore = correct;
    priorRank = rank;
    return {
      id: account.id,
      username: account.username,
      joined: Boolean(account.claimed_at),
      correct,
      rank,
      isCurrentUser: account.id === currentUserId
    };
  });
}

function publicGame(game) {
  return {
    id: game.id,
    startTime: game.start_time,
    deadline: game.deadline,
    awayTeam: {
      id: game.away_team_id,
      abbreviation: game.away_team_abbreviation,
      name: game.away_team_name,
      score: game.away_score
    },
    homeTeam: {
      id: game.home_team_id,
      abbreviation: game.home_team_abbreviation,
      name: game.home_team_name,
      score: game.home_score
    },
    status: game.status,
    completed: Boolean(game.completed),
    winnerTeamId: game.winner_team_id
  };
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function validateCredentials(username, password) {
  const cleaned = String(username || "").trim();
  if (!/^[A-Za-z0-9_-]{3,24}$/.test(cleaned)) {
    throw httpError(400, "Username must be 3–24 characters using letters, numbers, underscores, or hyphens.");
  }
  if (typeof password !== "string" || password.length < 4 || password.length > 72) {
    throw httpError(400, "Password must be between 4 and 72 characters.");
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function corsHeaders(origin, env) {
  const allowed = env.FRONTEND_ORIGIN || "https://mahaf027.github.io";
  const isLocal = origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = origin === allowed || isLocal ? origin : allowed;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Pool-Token, X-Admin-Token",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
