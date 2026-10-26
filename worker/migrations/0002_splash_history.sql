-- Splash Sports history. Each Splash player is imported as an unclaimed account
-- (claimed_at IS NULL, empty password) that cannot sign in. Registering with a
-- Splash name claims that row, so the imported picks stay with the same user id.

ALTER TABLE users ADD COLUMN splash_name TEXT COLLATE NOCASE;
ALTER TABLE users ADD COLUMN claimed_at TEXT;

UPDATE users SET claimed_at = created_at WHERE claimed_at IS NULL;

CREATE UNIQUE INDEX users_splash_name_idx ON users(splash_name) WHERE splash_name IS NOT NULL;

ALTER TABLE picks ADD COLUMN source TEXT NOT NULL DEFAULT 'site';
