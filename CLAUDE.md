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
- No pure white anywhere, in either theme. Cloud blue uses `#EDF4FA`, powder `#CFE3F1`, dusty-denim canvas `#5F86A6`, navy `#243A5E`, and pearl `#F5F4EF`; if a light surface is needed, use pearl or cloud, never `#ffffff` / `rgb(255,255,255)`. The Monochrome theme's brightest ink is `#F6F6F7`, deliberately short of white.
- There are TWO themes (Cloud blue and Monochrome), selected by `data-theme="mono"` on `<html>` and stored per device under the localStorage key `agora_dayplanner_theme` (never in state, never synced; do not rename that key either). A theme is ONLY a set of CSS custom property values: `:root` holds blue, `:root[data-theme="mono"]` overrides it. Never hardcode a colour in a rule; add a variable to BOTH blocks. A test enforces this.
- No emoji in the UI. Icons are inline SVG.
- No em dashes in any copy.
- The two priority tiers are labelled "Prio 0" and "Prio 1" (not Must/Should); the third is "Extra".
- Data is stored per-device in `localStorage` under the key `agora_dayplanner_v1`. Never rename that key or you orphan users' saved tasks.
- The rail's collapsed state is device chrome on the same contract as the theme: its own key `agora_dayplanner_rail`, applied as `data-rail="off"` on `<html>` by the head boot script, never a field on `state`, never synced. Do not rename that key or move it into `state`. It is a wide-layout feature only; under 900px the rail is already behind Menu and the controls are not drawn.
- Scrollbars are auto-hiding everywhere, through ONE rule set applied via `*`, not a per-element opt-in: the gutter width is constant and only the thumb colour changes, which is what keeps the appearance free of reflow. Do not add a `width` to any `:state` scrollbar rule, and do not give an element its own `scrollbar-width`/`scrollbar-color` (in Chrome either one disables the `::-webkit-scrollbar` rules for that element and takes the reserved gutter away). The Firefox fallback is gated behind `@supports not selector(::-webkit-scrollbar)` for exactly that reason. A test enforces both.
- The Notes editor claims four keys while the caret is inside `#noteBody`, at the TOP of the app-wide `keydown` handler, before the Enter/Escape branches: Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+Shift+Z (its own undo history, `ui.noteHist`, because the browser's native stack does not survive a re-render here) and, conditionally, the space bar (the `- ` list rules). A new global shortcut on any of those will be swallowed in the editor. Undo never syncs and never enters `state`.
- Spellcheck is left ON in the editor. Only `#syncKeyIn` opts out, because a sync key is a random string. Do not disable it anywhere else: the red underline is the browser's and cannot be cleared per word from a page, so switching it off is hiding the problem, not solving it. A test counts the opt-outs.

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
  node tests/test.js        # expect: RESULT: 1127 passed, 0 failed
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
