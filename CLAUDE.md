# Headspace Day Planner — project notes for Claude Code

This is a single-file day-planner web app. Read this before making changes.

## What it is
- The entire app is ONE file: `index.html` (HTML + CSS + vanilla JS, no framework, no build step).
- It is also an installable PWA. The extra files make that work:
  - `manifest.webmanifest` — app name, icons, theme colours.
  - `sw.js` — offline cache. Has a `CACHE` version constant near the top.
  - `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — home-screen icons.
- Hosted free on GitHub Pages. Pushing to the `master` branch redeploys it.

## Hard rules (do not break these)
- Do NOT change the layout or functionality unless explicitly asked. Visual/style tweaks are fine; behaviour stays as-is.
- No pure white anywhere. The theme uses cloud blue `#EDF4FA`, powder `#CFE3F1`, dusty-denim canvas `#5F86A6`, navy `#243A5E`, and pearl `#F5F4EF`. If a light surface is needed, use pearl or cloud, never `#ffffff` / `rgb(255,255,255)`.
- No emoji in the UI. Icons are inline SVG.
- No em dashes in any copy.
- The two priority tiers are labelled "Prio 0" and "Prio 1" (not Must/Should); the third is "Extra".
- Data is stored per-device in `localStorage` under the key `agora_dayplanner_v1`. Never rename that key or you orphan users' saved tasks.

## After ANY change to index.html
1. Run the tests (see below). They must stay green.
2. Bump the cache version in `sw.js` (e.g. `headspace-v8` -> `headspace-v9`). Skipping this makes installed phones keep serving the old copy. This is the single most common mistake.
3. Commit with a short message and push to `master`.

## Running the tests
From the project root:
- Behaviour suite (fast, no browser):
  ```
  cd tests && npm install   # first time only, installs jsdom
  cd ..                     # run from the project root: test.js reads ./index.html
  node tests/test.js        # expect: RESULT: 528 passed, 0 failed
                            # the suite checks this number itself and tells you when to bump it
  ```
- Optional visual/browser suite (needs Python + Playwright; skip if not set up):
  ```
  cd tests
  pip install playwright && python -m playwright install chromium
  python -m http.server 8899 &     # serve the app
  python visual.py                 # geometry, theme, mobile, no-white, no-emoji checks
  ```

## Publishing a change (the loop)
```
git add -A
git commit -m "describe the change"
git push
```
GitHub Pages redeploys in ~1–2 minutes. On phones, fully close and reopen the installed app after the cache bump.

## Notes
- `SETUP.md` has the one-time hosting + install walkthrough for reference.
- If asked to move data between devices: that's the in-app Export / Import (menu), not a git action.
