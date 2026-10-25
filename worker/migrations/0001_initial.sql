PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_plain TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  season_type INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  label TEXT NOT NULL,
  window_start TEXT NOT NULL UNIQUE,
  window_end TEXT NOT NULL,
  reveal_at TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,
  deadline TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  away_team_abbreviation TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  home_team_id TEXT NOT NULL,
  home_team_abbreviation TEXT NOT NULL,
  home_team_name TEXT NOT NULL,
  away_score INTEGER,
  home_score INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  completed INTEGER NOT NULL DEFAULT 0,
  winner_team_id TEXT,
  last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX games_week_id_idx ON games(week_id);
CREATE INDEX games_completed_idx ON games(completed);

CREATE TABLE picks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  selected_team_id TEXT NOT NULL,
  is_auto INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX picks_game_id_idx ON picks(game_id);

CREATE TABLE system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
