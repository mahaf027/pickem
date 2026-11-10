// Reuse the existing weekly leaderboard API; no History-specific backend is needed.
export async function fetchPoolHistory(request) {
  const latest = await request("/api/leaderboard");
  const season = latest.week?.season || new Date().getFullYear();
  const regularWeeks = (latest.weeks || []).filter((week) => week.season === season && week.seasonType === 2);
  const boards = new Map();
  const pending = regularWeeks.filter((week) => {
    if (week.id !== latest.week?.id) return true;
    boards.set(week.number, latest);
    return false;
  });
  // Limit concurrent requests since each leaderboard response contains a full pick grid.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (next < pending.length) {
      const week = pending[next++];
      const board = await request(`/api/leaderboard?weekId=${encodeURIComponent(week.id)}`);
      if (board.week?.id !== week.id) throw new Error("The week list changed. Refresh History to try again.");
      boards.set(week.number, board);
    }
  }));
  const weeks = Array.from({ length: 18 }, (_, index) => {
    const board = boards.get(index + 1);
    const games = board?.games.length || 0;
    const completed = board?.games.filter((game) => game.completed).length || 0;
    return { number: index + 1, games, completed, complete: games > 0 && completed === games };
  });
  const accounts = new Map((latest.seasonRows || []).map((row) => [row.id, row]));
  const scores = new Map();
  for (const [number, board] of boards) {
    for (const row of board.rows) {
      accounts.set(row.id, row);
      scores.set(`${row.id}:${number}`, row.score);
    }
  }
  const rows = [...accounts.values()]
    .sort((a, b) => a.username.localeCompare(b.username))
    .map(({ id, username, joined, isCurrentUser }) => ({
      id, username, joined, isCurrentUser,
      scores: weeks.map((week) => week.completed ? scores.get(`${id}:${week.number}`) ?? 0 : null)
    }));
  weeks.forEach((week, index) => { week.result = resolveWeeklyWinner(weeks, rows, index); });
  return { season, weeks, rows };
}

// Each week's prize is independent: a runoff never replaces the next week's contest.
export function resolveWeeklyWinner(weeks, rows, originIndex) {
  const origin = weeks[originIndex];
  const result = { status: "pending", leaders: [], winners: [], rounds: [] };
  if (!origin.complete || !rows.length) return result;
  const high = Math.max(...rows.map((row) => row.scores[originIndex]));
  let contenders = rows.filter((row) => row.scores[originIndex] === high).map((row) => row.id);
  result.leaders = [...contenders];
  if (contenders.length === 1) return { ...result, status: "won", winners: contenders };
  for (let number = origin.number + 1; number <= 18; number++) {
    const index = weeks.findIndex((week) => week.number === number);
    if (index < 0 || !weeks[index].complete) {
      result.rounds.push({ number, contenders: [...contenders], scores: null });
      return { ...result, status: "runoff" };
    }
    const scores = contenders.map((id) => ({ id, score: rows.find((row) => row.id === id).scores[index] }));
    const best = Math.max(...scores.map((entry) => entry.score));
    contenders = scores.filter((entry) => entry.score === best).map((entry) => entry.id);
    result.rounds.push({ number, contenders: [...contenders], scores });
    if (contenders.length === 1) return { ...result, status: "won", winners: contenders };
  }
  return { ...result, status: "split", winners: contenders };
}
