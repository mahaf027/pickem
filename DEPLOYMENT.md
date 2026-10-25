# Deployment guide

The application has two independently deployed pieces:

- `site/` is the static frontend published at `https://mahaf027.github.io/pickem/` by GitHub Actions.
- `worker/` is the API, database binding, and scheduled updater deployed to Cloudflare Workers.

GitHub Pages cannot receive account or pick writes and cannot run scheduled jobs, which is why the Worker is required.

## 1. Create the Cloudflare database

Install a current Node.js release, then authenticate Wrangler:

```sh
npx wrangler@latest login
cd worker
npx wrangler@latest d1 create mahaffey-pickem
```

Copy the returned database ID into `worker/wrangler.jsonc`, replacing `REPLACE_AFTER_CREATING_D1_DATABASE`.

Apply the database migration:

```sh
npx wrangler@latest d1 migrations apply mahaffey-pickem --remote
```

## 2. Set backend secrets

Create two long random values locally. Store one under each secret name:

```sh
npx wrangler@latest secret put AUTH_SECRET
npx wrangler@latest secret put ADMIN_TOKEN
```

- `AUTH_SECRET` signs short-lived pool-access tokens.
- `ADMIN_TOKEN` protects schedule synchronization and the password export endpoint.

The shared pool password is configured as the case-sensitive value `Mutiny` in `worker/wrangler.jsonc`.

## 3. Deploy the backend

From `worker/`:

```sh
npx wrangler@latest deploy
```

Wrangler prints a URL similar to `https://mahaffey-pickem-api.<account>.workers.dev`. Copy that URL into `site/assets/config.js` as `API_BASE_URL`, without a trailing slash.

Run the first schedule import manually after deployment:

```sh
curl -X POST "https://YOUR-WORKER-URL/api/admin/sync" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

If the NFL is out of season or no games exist in the active Tuesday–Monday window, the import will report that no games were returned. The scheduled job will try again after the next Monday 9 PM Pacific cutover.

## 4. Publish the frontend

Push the repository to `main`. In the GitHub repository, choose **Settings → Pages → Source → GitHub Actions**. The included workflow packages `site/` and all 32 files in `nfl_team_logos/`, then publishes the artifact.

## Administration

### View account passwords

Passwords are intentionally stored as readable text because the pool owner requested local password recovery. Tell players not to reuse a password from any other account.

Export accounts through the protected API:

```sh
curl "https://YOUR-WORKER-URL/api/admin/passwords" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

Or query D1 directly:

```sh
cd worker
npx wrangler@latest d1 execute mahaffey-pickem --remote \
  --command "SELECT username, password_plain FROM users ORDER BY username"
```

### Force a schedule/results refresh

```sh
curl -X POST "https://YOUR-WORKER-URL/api/admin/sync" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

## Splash Sports history

Earlier weeks played on Splash Sports are imported as **unclaimed players**. They appear on the leaderboard as "Not joined yet" and cannot sign in. When someone creates an account, they can pick their Splash name from the signup form, and their imported history moves with them automatically.

Apply the migration once (after pulling this change):

```sh
cd worker
npx wrangler@latest d1 migrations apply mahaffey-pickem --remote
npx wrangler@latest deploy
```

Import the history file (safe to re-run; picks made on the site are never overwritten):

```sh
curl -X POST "https://YOUR-WORKER-URL/api/admin/import-splash" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data @data/splash-2026.json
```

The file format is `{"season": 2026, "weeks": [{"week": 1, "picks": {"Splash name": ["KC", "BUF", ...]}}]}`, with one winner per game; a trailing `*` (e.g. `"NE*"`) marks a Splash auto-pick. Any game a listed player has no pick for is stored as a missed pick (a loss), matching Splash. The response lists any picks that could not be matched to a game.

Link an account that existed before the import to its Splash name:

```sh
curl -X POST "https://YOUR-WORKER-URL/api/admin/link" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{"username": "theo", "splashName": "TheoM"}'
```

Undo a wrong claim (the Splash name becomes claimable again and that login stops working):

```sh
curl -X POST "https://YOUR-WORKER-URL/api/admin/unclaim" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{"splashName": "TheoM"}'
```

## Update schedule

The Worker wakes every ten minutes but avoids unnecessary NFL requests:

- After 9:00 PM Pacific each Monday, it imports the Tuesday–Monday slate once.
- It starts polling a week only when an incomplete game has kicked off.
- It continues polling during the game window and records final winners and scores.
- At each game’s deadline, missing picks become away-team picks.
- Thursday/Saturday/early international games lock at kickoff. Every remaining game locks Sunday at 10:00 AM Pacific.

NFL data is normalized behind `fetchScoreboard()` in `worker/src/index.js`, so the upstream provider can be replaced without changing the database or frontend.
