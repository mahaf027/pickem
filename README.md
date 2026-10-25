# Sunday Pick'em

A lightweight, static foundation for a weekly NFL pick'em site. The first release includes a Leaderboard home page and a Picks page, ready to deploy to GitHub Pages.

## Preview locally

From the repository root:

```sh
python3 -m http.server 8000 --directory site
```

Then open <http://localhost:8000>.

## Publish with GitHub Pages

1. Push the `main` branch to GitHub.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The included `Deploy to GitHub Pages` workflow will publish the contents of `site/` on every push to `main`.

The site uses relative URLs, so it works both at a custom domain and at a project URL such as `https://username.github.io/pickem/`.

## Structure

```text
site/
├── index.html          # Leaderboard
├── picks/index.html    # Picks
├── 404.html
└── assets/
    ├── app.js
    └── styles.css
```
