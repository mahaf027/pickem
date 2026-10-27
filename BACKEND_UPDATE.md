# Backend update: Splash history (for Theo)

The Splash history PR is merged and the website is already live, but the **Cloudflare backend is still the old version**. Until it's updated, the live site:

- has no Splash weeks (Weeks 1–7);
- shows an error on the History page and when you click a player's name;
- doesn't show the "Played on Splash Sports?" dropdown at signup;
- shows a wrong password as a vague connection error.

This is a one-time job of about 10 minutes, and you're the only one who can do it because it needs your Cloudflare login. Run everything from the repository root (the folder with `package.json`), on an up-to-date `main`.

## Before you start

- **Node.js** installed (`node --version` should print something).
- **Wrangler logged in** to the Cloudflare account that owns `mahaffey-pickem-api`:

  ```sh
  npx wrangler@latest login
  ```

- **Your `ADMIN_TOKEN`.** This is the value you set with `wrangler secret put ADMIN_TOKEN` during the original setup. Put it in your terminal for the commands below:

  ```sh
  export ADMIN_TOKEN='paste-your-admin-token-here'
  export API=https://mahaffey-pickem-api.theo2026.workers.dev
  ```

  If you've lost it, set a new one with `cd worker && npx wrangler@latest secret put ADMIN_TOKEN && cd ..`. Then use the new value.

## Step 1: Update the database

This adds the columns for Splash players. It must run **before** the deploy in Step 2, because the new backend expects those columns.

```sh
cd worker
npx wrangler@latest d1 migrations apply mahaffey-pickem --remote
```

It should list `0002_splash_history.sql` as applied. Existing accounts and picks are kept.

## Step 2: Deploy the new backend

Still in `worker/`:

```sh
npx wrangler@latest deploy
cd ..
```

Check it worked. This command should print `{"error":"Enter the pool password first."}`. The old backend prints `Sign in to continue.` instead.

```sh
curl -s "$API/api/splash-names"
```

## Step 3: Import the Splash history

From the repository root:

```sh
curl -s -X POST "$API/api/admin/import-splash" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data @data/splash-2026.json
```

Expected result:

```json
{"players":7,"picks":749,"missed":0,"unmatched":[],"missingWeeks":[]}
```

- **If `missingWeeks` isn't empty:** the database doesn't have those NFL weeks yet. Run `curl -s -X POST "$API/api/admin/sync" -H "X-Admin-Token: $ADMIN_TOKEN"` once per missing week, then repeat the import.
- **Running it again is safe.** It never overwrites picks someone made on the site.

## Step 4: Link your existing account to your Splash history

Your site account was created before the import, so it needs to be linked to `Theo-Mahaffey` by hand. Look up your exact site username:

```sh
curl -s "$API/api/admin/passwords" -H "X-Admin-Token: $ADMIN_TOKEN"
```

Then link it, replacing `YOUR_SITE_USERNAME`:

```sh
curl -s -X POST "$API/api/admin/link" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "YOUR_SITE_USERNAME", "splashName": "Theo-Mahaffey"}'
```

Expected result: `{"ok":true,...}`.

- **If any other account already exists on the site**, link it the same way with that person's Splash name.
- **Everyone else** signs up and picks their Splash name from the dropdown.

The Splash names are `big-toe-4398`, `Brian-Mahaffey`, `mahafsize`, `Nate-Tav`, `rhersey_4`, `rust-zero-5747` (Will) and `Theo-Mahaffey`.

## Step 5: Check the live site

Sign in at <https://mahaf027.github.io/pickem/> and check:

- **YTD standings** shows all 7 Splash players. Through Week 6, plus Week 7 so far, the totals are mahafsize 64, Brian-Mahaffey 62, big-toe-4398 62, Nate-Tav 61, Theo-Mahaffey 61, rust-zero-5747 59, rhersey_4 52. Week 7 totals will grow as the last games finish.
- **The week selector** goes back to Week 1, and those weeks say "Imported from Splash Sports".
- **Clicking a name** opens that player's history.
- **Your account** is no longer listed separately from `Theo-Mahaffey`.

If something looks wrong, send Will the output of the command that failed.

## Fixing a wrong claim later

If someone picks the wrong Splash name at signup, this puts the name back up for grabs. That person then signs up again.

```sh
curl -s -X POST "$API/api/admin/unclaim" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"splashName": "Nate-Tav"}'
```

## Good to know

- **Week 7 picks:** Week 7 came from Splash. If you already entered Week 7 picks on the site, your site picks are kept and the Splash ones are skipped.
- **Brand-new players get free points:** this is how the site already worked before this update. A brand-new player who was never on Splash gets automatic away-team picks for every game already played, so they start with points instead of 0. Tell Will if you'd rather they start at 0.
