# Sunday Pick'em

A private weekly NFL pick'em application with shared accounts, game-by-game deadlines, automatic away-team defaults, live result updates, and a weekly leaderboard.

## Architecture

- **GitHub Pages** serves the frontend from `site/` at `https://mahaf027.github.io/pickem/`.
- **Cloudflare Worker** serves the JSON API and runs a ten-minute scheduled maintenance task.
- **Cloudflare D1** stores accounts, readable passwords, sessions, schedules, picks, and results.
- The schedule/results adapter currently reads ESPN's public NFL scoreboard feed.

The pool password is the case-sensitive value `Mutiny`. Account passwords are intentionally readable by the pool owner; players are warned not to reuse passwords from other services.

## Preview locally

From the repository root:

```sh
python3 -m http.server 8000 --directory site
```

Then open <http://localhost:8000>.

The pages require a configured backend URL before account and pick requests can succeed. See [DEPLOYMENT.md](DEPLOYMENT.md) for full backend and frontend deployment.

## Publish with GitHub Pages

1. Push the `main` branch to GitHub.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The included `Deploy to GitHub Pages` workflow will publish the contents of `site/` and the NFL logo assets on every push to `main`.

The site uses relative URLs, so it works both at a custom domain and at a project URL such as `https://username.github.io/pickem/`.

## Structure

```text
site/
├── index.html           # Live leaderboard
├── access/index.html    # Pool gate and account access
├── picks/index.html     # Weekly picks
├── 404.html
└── assets/
    ├── app.js            # Shared client/auth helpers
    ├── config.js         # Deployed API URL
    ├── access.js
    ├── leaderboard.js
    ├── picks.js
    └── styles.css

worker/
├── migrations/0001_initial.sql
├── src/domain.js         # Pacific-time and scoring rules
├── src/index.js          # API and scheduled updater
├── test/domain.test.js
└── wrangler.jsonc
```

## Behavior

- A correct pool password is required before registration or sign-in.
- Usernames are unique without regard to case.
- A pick locks at the earlier of its game kickoff or Sunday at 10:00 AM Pacific.
- Missing locked picks are automatically assigned to the away team.
- Other players' picks stay hidden until Sunday at 10:00 AM Pacific.
- The next Tuesday–Monday slate imports after Monday at 9:00 PM Pacific.
- Active games are checked every ten minutes until marked final.
- The leaderboard awards one point for each correct completed-game pick.

## Tests

With a working current Node.js installation:

```sh
npm test
npm run check
```
