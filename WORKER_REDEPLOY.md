# Redeploy the Cloudflare Worker

Use this checklist for routine backend updates. Run the commands from the repository root.

## 1. Test the update

```sh
npm test
npm run check
```

## 2. Log in to Cloudflare if needed

```sh
npx wrangler@latest login
```

You can skip this when Wrangler is already authenticated to the Cloudflare account that owns `mahaffey-pickem-api`.

## 3. Deploy the Worker

```sh
cd worker
npx wrangler@latest deploy
cd ..
```

Wrangler should report the deployed Worker URL:

```text
https://mahaffey-pickem-api.theo2026.workers.dev
```

The existing D1 database binding, cron trigger, and secrets are preserved. The current frontend/auth and pick-visibility update does **not** require a database migration or resetting any secrets.

## 4. Verify the deployment

```sh
curl -s https://mahaffey-pickem-api.theo2026.workers.dev/api/health
```

Expected response:

```json
{"ok":true,"service":"mahaffey-pickem-api"}
```

## 5. Publish the frontend too

This update also changes files under `site/`. Commit and push the changes to `main` so the GitHub Pages workflow deploys the matching frontend:

```sh
git add .
git commit -m "Update sign-in and early-game pick visibility"
git push origin main
```

Review `git status` before committing so only the intended files are included.

