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
- Note folders are one flat level and a note's `folder` field is PLACEMENT: it rides the pos axis (`POSF.note`, `sigP`) beside `pinned`, so moving a note composes with concurrent title/body edits and can never revive a deleted note. A dead folder reference means loose; read it through `noteFolderOf`, never `n.folder` directly. Deleting a folder must move its notes out (the confirm modal), never delete them.
- The sticky note's THREE sizes are measured limits, not taste, and must not be flattened to one number. The corner is 232px wide from 901 to 1199px and 464px above that, and `#main.stickycorner #board`'s `padding-right` must always be at least the corner width plus its 22px offset: that reservation is what clears the last column at max scroll AND what stops a non-scrolling board putting a column under the corner. The corner's 92px pad height and its width below 1200px cannot grow: at 1024 a day column's add control sits 159px above the board bottom (the corner uses 147) with its centre at x=738 (a 264px corner reaches it), so growing either buries a control. Notes grows on width only, because `#noteBody` is a fixed 240px and the pane is already exactly full at 1024. Only the under-900px flow pays in height (168px). Section 13 of REVIEW.md has the measurements; tests pin all of it.
- The sticky note is ONE synced block, `state.sticky = {text, at}`, not an item: the stamp is written AT the keystroke together with the text (never let those two separate, or the debounce race from Section 5 of REVIEW.md comes back), it merges whole by later `at`, and its `<textarea>` is static markup that no render may rebuild. Two devices editing it concurrently keep the later text whole; that limit is documented, not solved.
- Red in Monochrome backs exactly FOUR variables: `--done`, `--today`, `--grad`, `--north`. The active-nav accent and True north statements are the only UI added to red's reach, and both audits (jsdom declaration whitelist, viewport live sweep) enumerate them; widen those whitelists deliberately or not at all. Cloud blue still never contains the red hex: the nav accent reuses `--today` (teal there) and the statements use `--north` (`#3F6488`).
- WHITE MEANS ACTIVE in the rail nav. A resting `.navbtn` declares no surface and sits on the rail; only `.navbtn.on` takes `--northbg` (`#F6F6F7`), the same backdrop `#fpanel` uses. It must be `background-color`, not the `background` shorthand, or it resets the hover layer. Because a dark theme cannot lend a near-white pill its near-white ink, `.navbtn.on` also re-points the island ink set (`--northtxt`, `--northmut`, `--northink-rgb`; the full set is `--northtxt`, `--northmut`, `--northmut2`, `--northline`, `--northfield`, `--northink-rgb`, `--northfocus`, `--northfocus-rgb`, declared in both theme blocks). A resting item must NOT re-point them: its hover and press were tuned against the rail, where mono's near-white `--ink-rgb` correctly lightens. Rules inside these surfaces must keep reading the ordinary role (`--mut`, `--txt`, `--cloud`, ...) and never a `--north*` variable directly. Any wash on them must LAYER (`background-image`), never replace `background`, or a hovered active item shows the rail through itself and goes near-black in mono.
- The active nav item is marked by the white backdrop PLUS four marks that must all stay: the inset 3px `--today` bar, the `--today` icon tint, the `--northline` rim, and the label at `--northtxt`/600 against a resting `--mut`/500. Cloud blue has no red, so its bar and icon are the today teal (4.17:1 on the backdrop) and the white-against-powder surface step is small (about 1.2), which is exactly why blue needs all four and none may be dropped there. Do not invent a colour, border style or effect to solve an active-state problem.
- EXACTLY ONE nav item may carry `.on` and `aria-current="page"`, in every view INCLUDING float mode. Float mode is a mode of the board view, so `state.settings.view` is still `'board'` while it runs: `render()` must let the float toggle take the mark and Board yield it, which is what the `fon` guard in the `data-v` loop does. Two items were marked before 2026-08-12; tests now assert the count in all five states.
- The True north statement face is 19px/700. That size is the FLOOR, not a preference: mono's red measures 3.65:1 on the backdrop, which is legal only as WCAG large text, and the large-text floor at weight 700 is 14pt (18.66px). Contrast does not change with type size, so no smaller size can be rescued by any backdrop, and the scale has nothing between 17 and 19. Do not shrink it. The nav labels are 13.5px and are NOT tied to it: they were briefly paired at 19px and that pairing was reverted. Sections 12 and 14 of REVIEW.md have the measurements.

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
  node tests/test.js        # expect: RESULT: 1308 passed, 0 failed
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
