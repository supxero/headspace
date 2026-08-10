# Headspace, technical review

State of the code as of the commit that added this line (2026-08-10), which fixed risks 1, 3 and 9 of the previous revision. Written for a reviewer who has not read the file. Line numbers refer to `index.html` at this commit and will drift; section names and function names are the stable handles. This is a critical review, not a status report: the Weak points and Risk list sections are the ones to read first.

## 1. Structure

One file, `index.html`, 2181 lines: CSS to ~line 430, static HTML to ~500, then one `<script>` to the end. No modules, no build. `sw.js` (36 lines) is a cache-first service worker keyed on a manually bumped `CACHE` constant. Tests are `tests/test.js` (1058 lines, jsdom) plus `tests/visual.py` (109 lines, Playwright, currently unrunnable: no Python on the dev machine).

Script sections in order:

| Lines (approx) | Section |
|---|---|
| 505–533 | helpers, `fresh()`, state globals (`state`, `ui`) |
| 534–608 | per-item change tracking: `eachItem`, `sigOf`, `snapSigs`, `stampChanges`, `stampLegacy` |
| 610–721 | merge: `flatten`, `pickNewer`, `mergeTombs`, `stateSig`, `mergeStates`, `mergeBins`, `rebuild` |
| 723–769 | `load`/`save`/`commit`, beforeunload/visibility hooks, 60s `rollIfNewDay` timer |
| 771–1103 | Supabase sync: REST calls, `pushSoon`/`flushPush`/`putState`, `applyCloud`, `syncCycle`, 25s poll, connect/forget, sync modal |
| 1105–1201 | data ops (`findTask`, `pull`, `place`, `move`, `rollover`, `rollIfNewDay`), toast/undo |
| 1203–1348 | recycle bin: `binCapture`, restore/purge/empty, bin modal |
| 1350–1743 | metrics + all render functions, master `render()` |
| 1745–2019 | the delegated click handler and `change` handler |
| 2021–2103 | keyboard, blur (rename commit), drag and drop |
| 2105–2181 | modals (help, tab-delete confirm), autogrow, resize, boot |

State flow: every mutation goes `handler mutates state -> save() (400ms debounce) -> commit() -> stampChanges() diff -> localStorage -> pushSoon() (1800ms debounce) -> syncCycle()`. Rendering is full `innerHTML` rebuild of each region on every `render()`.

Grown unwieldy:

- The delegated click handler (`index.html:1764`) is ~224 lines and 65 `case`s with two exit conventions: `return` means the case handled its own save/render, `break` falls through to a shared `save(); render()`. Picking the wrong one is an easy, silent mistake, and the pre-switch block that closes the inline add field (added for the mobile trap fix) runs a deferred `save(); render()` in a `setTimeout(0)` that has to guess whether a rename just started by sniffing `document.activeElement.dataset.kind`. It works and is tested, but it is the most fragile control flow in the file.
- `render()` re-renders everything on every action. Fine at current data sizes, but it is why focus/caret preservation needs manual bookkeeping (`ui.adding`, `ui.addText`); any future input element gets the same class of bug until someone remembers that.

## 2. State shape

```
state = {
  ver: 2,
  days:   { "YYYY-MM-DD": { must:[Task], should:[Task], extra:[Task] } },
  carry:  [Task],                    // + .from label on carried tasks
  focus:  [{ id, title, done, doneAt, up }],
  floats: [{ id, name, tasks:[Task], up }],
  tomb:   { id: msTimestamp },       // deletions, kept 45d (TOMB_KEEP)
  bin:    { id: { k:'task'|'sub'|'float'|'focus', at, body, loc?, pid?, pname?, moved?, purged? } },
  settings: { view, boardOffset, floatMode, activeFloat, calSel, calOffset,
              mRange, stripDay, lastRoll, showDone }
}
Task = { id, title, done, subtasks:[{id,title,done,up,pos}], up, pos, from? }
```

Every mergeable item carries **two** stamps. `up` is when its *content* last changed (title/name, done, doneAt). `pos` is when it last *moved* (location, order within its list, and a task's `from` label, which rollover writes as part of the move). They are merged independently, see Section 3. Anything written before the split has no `pos`; `posOf()` falls back to `up`, and `stampLegacy()` backfills it at load, so the split becomes fully active after one save.

Synced vs local:

- **Merged item-by-item:** everything under `days`, `carry`, `focus`, `floats` (tasks, subtasks, tabs), plus `tomb` and `bin`.
- **Device-local under merge:** the entire `settings` object. `rebuild()` (`index.html:684`) takes only `mine.settings`. `VIEWSET` (`index.html:780`) is used only by the manual-Pull path (`applyCloud`) to keep local view state while importing the rest of the remote settings. So merge and manual Pull treat settings differently; that asymmetry is deliberate but undocumented outside this file.
- **localStorage, never in the cloud blob:** the sync key (`agora_dayplanner_synckey`), agreement stamp (`agora_dayplanner_syncstamp`), pre-pull backup (`agora_dayplanner_v1_backup`).

**Unknown top-level keys now pass through (fixed, was the headline risk).** `rebuild()` still reconstructs the keys it understands, declared in `MERGED_KEYS`, but it ends with `carryUnknown(out, mine, theirs)`, which copies through every top-level key neither side's merge logic knows about. A key added to `state` in future therefore survives a merge instead of being silently dropped. It gets no last-write-wins (there are no stamps for it): whichever side has it wins, and if both differ the smaller JSON wins, which is arbitrary but identical on both devices, so they still converge. `stateSig()` hashes unknown keys too, so a change to one still triggers a push. A test asserts `MERGED_KEYS` still matches `Object.keys(fresh())`, so adding a key to the canonical shape fails the suite until someone decides whether it needs real merge semantics or the generic pass-through is fine.

## 3. Sync and merge

Mechanics: one Supabase row per sync key, whole-state JSON in `data`, publishable API key embedded in the page. `syncCycle()` (`index.html:966`) runs on boot, focus/visibility, reconnect, a 25s poll, and 1.8s after any edit. It does GET, `mergeStates(local, cloud)`, adopts the merge if it changed anything, and PUTs if the cloud is missing anything, comparing via `stateSig`. The Push/Pull buttons are raw overwrites in both directions (documented in the sync modal); Pull backs up to `agora_dayplanner_v1_backup` and offers toast-undo.

Merge rules: union by id. Per item, **content and position are resolved separately**: the side with the newer `up` supplies title/done/doneAt/name, the side with the newer `pos` supplies location, order and `from`, and `pickNewer()` splices the two together. Equal stamps break by JSON comparison of just the fields under that stamp, so both devices agree. A tombstone kills anything whose **content** stamp is older than the deletion. `stampChanges()` assigns both stamps by diffing two signatures (`sigC`, `sigP`) at commit time, so every mutation path is covered without instrumentation. Subtasks are no longer listed in their parent's signature, so adding a step does not restamp the task it belongs to. Bin entries follow their tombstones; purge markers are terminal.

Cases resolved by an arbitrary rule or still able to lose data:

1. **Two edits to the same item's content: later `up` wins, the loser is silently discarded.** This is now narrower than it was, since position no longer competes, but it still covers the combination that matters most: **a rename on one device and a tick on the other, on the same task, will lose one of them.** `done` and `title` share the `up` stamp. Splitting `done` onto a third axis would close it and is the obvious next step if this bites. No record, no merge UI.
2. **Reorder vs content edit: fixed.** `sigOf` was split into `sigC`/`sigP` and each item carries `up` and `pos`. A reorder now bumps only `pos` and a rename only `up`, so neither can discard the other, in either direction, and a move between zones composes with a concurrent edit to the same task. Tested six ways, including the mirror cases and convergence.
3. **Move vs rename: fixed** by the same split. The task lands in the newly moved-to place carrying the newly typed text.
4. **Edit after delete resurrects** (deliberate, tested). Ambiguous case: the edit's `up` and the tomb are compared across devices with unsynchronized clocks. **A reorder or a move no longer resurrects a deleted item**, since the tombstone is compared against the content stamp only; editing an item asserts it should exist, shuffling it does not.
5. **Clock skew skews everything.** All conflict resolution is `Date.now()` comparison. A device minutes fast wins conflicts it should lose. Nothing detects or compensates.
6. **No optimistic concurrency on the row.** Two devices can GET the same cloud state, merge, and PUT; the second PUT overwrites the first. Nothing is destroyed locally, and the next cycle re-merges and re-pushes, but the cloud can be transiently missing one device's changes, and a device that stops syncing right after losing that race leaves the cloud stale.
7. **Expiry horizons:** bin bodies 30d, tombstones 45d. A device offline more than 45 days resurrects its stale copy of deleted items as "edits after delete".
8. **`emptyPlanner()` ignores `tomb` and `bin`,** so a device whose planner is all-deleted counts as empty; `connectKey` will then adopt the cloud wholesale and discard the local bin bodies.
9. **Restore vs permanent-delete race:** restore wins the item, purge only strips the stored body. Deterministic, but chosen, not derived.
10. **Carry-over tray, observed in Chrome 2026-08-10.** An automatic merge cannot empty or hide the tray: verified against a cloud copy predating rollover and against one with `carry:[]`, the locally carried items win both times. **Exception A is now fixed** by the content/position split: a task rolled into the tray here and renamed on another device after midnight keeps its place in the tray, picks up the rename, and keeps its "Prio 0 · Sun" origin label, because `from` is positional and the rename only moves the content stamp. Pinned by a test. A manual **Pull** still empties the tray by design, restoring the tasks to their day columns, with Undo in the toast.
11. **The once-per-day gate is now visible rather than silent.** `rollIfNewDay` still returns immediately when `settings.lastRoll === today()`, so anything landing on a past day after today's sweep is not swept automatically, which is deliberate: continuous sweeping would fight a user who back-dates a task on purpose. What changed is that the board nav now renders a button reading "N waiting on past days" whenever unfinished tasks sit on past days (`pastOpenCount()`), and pressing it runs the sweep on demand, stamped now rather than at midnight since it is a deliberate act. The gate's behaviour is asserted by a test driven through `rollIfNewDay`, not `rollover`, so it cannot change silently.
12. Manual Push/Pull remain whole-blob overwrites; a habitual Push from a stale device wipes cloud-side items until another device's next merge re-uploads whatever it still holds (items deleted only in the cloud copy come back; items only in the cloud copy are gone for good unless another device holds them).

## 4. Known weak points

- **`ui.skipBin` / `ui.binNote` are side-channels** between three click-handler cases (`spop`, the two drag-conversion branches, `float-del-move`) and the next `stampChanges` run, carried in mutable `ui` fields and cleared unconditionally per commit. If an unrelated commit fires inside the 400ms save debounce (e.g. a sync `adopt()`), the flags are consumed by the wrong commit: worst case a popped-out subtask also shows up in the bin as a "deleted" step. Low probability, unhandled, untested.
- **`prevSnap`** (the deep copy backing `binCapture`) must be refreshed by every path that swaps state; today `load()` and `commit()` do it and `adopt()` gets it transitively via commit. A future state-swapping path that forgets will produce bin entries with wrong or missing bodies, silently.
- **Two stamps per item now, and both must be maintained.** `stampChanges` writes `up` and `pos` from two signatures; a future field added to an item must be classified into `CONTENTF` or `POSF` (used by `pickNewer` for tie-breaks) *and* into `sigC` or `sigP` (used to decide which stamp moves). Miss the signature and the field never triggers a stamp, so edits to it silently lose merges. Nothing enforces the pairing.
- **Two-field board position** (`boardOffset` for wide, `stripDay` for narrow) still exists; `shiftBoard()`/`showDay()` keep them in step at the five current call sites, but `windowDays()` (`index.html:1493`) still branches on `window.innerWidth<900`, so any new navigation control must go through the helpers or it will regress exactly like Prev/Next did on iOS.
- **`paintBin()` is called from `commit()`**: a DOM write inside the persistence layer, because renders don't run on commit. Works, but it is the only place data-layer code touches the DOM besides the save badge, and it will confuse anyone refactoring commit.
- **Copy rules are enforced by habit, not tooling.** No-white / no-emoji / no-em-dash checks live in `visual.py`, which cannot currently run (no Python). Reviews have relied on grep.
- **The cache-bump ritual** (`sw.js` CACHE constant) is manual and unenforced; CLAUDE.md calls it the most common mistake, and nothing in the test suite checks that the constant changed alongside `index.html`.
- **`state.days` is never pruned.** History is the data model (metrics, streak), so this is by design, but `syncCycle` runs `flatten`+`stateSig` up to three times per cycle, every 25 seconds, over everything ever created. Years of data on a low-end phone will make the poll visibly expensive.
- **Quota/private-mode handling is a toast** ("not saving") plus in-memory operation; `sync.pending` is memory-only, so a kill while offline loses nothing (merge recovers) but a kill mid-typing loses the debounce window (up to 400ms of edits).
- **Quick patches acknowledged as such:** the `setTimeout(0)` outside-tap logic in the click handler (Section 1); `binWhere`'s guards for malformed `loc` return vague labels rather than validating entries on write; `restoreBin` re-uses ids on restore (safe today because revival clears tombs, but it means id uniqueness across time is not an invariant anyone can rely on).

## 5. Regressions and history

- **Mobile inline add trap** (fixed `b6f9c50`): root cause was the resize handler rebuilding the board when the soft keyboard opened. Actually fixed: resize now re-renders only on width change, typed text lives in `ui.addText`. Residual: a *real* width change (rotation) mid-typing still rebuilds; text survives, focus is restored, but the keyboard may flicker. The underlying innerHTML-rerender architecture that caused it is unchanged.
- **Devices overwriting each other** (fixed `33134a3`): whole-blob last-write-wins replaced by the per-item merge. Actually fixed and heavily tested; residual ambiguities listed in Section 3.
- **iOS Prev/Next dead** (fixed `68df415`): not iOS at all; `nav` wrote `boardOffset` while narrow layouts read `stripDay`. Fixed properly at the cause (`shiftBoard`/`showDay`), but the dual-field design that made it possible is still there (Section 4).
- **Carry-over tray vanished** (fixed `13b5551`): `rollover()` had only ever run at boot; auto-sync removed the daily restart that masked it. Actually fixed (`rollIfNewDay` on foreground + 60s timer, midnight-dated stamps, `lastRoll` made device-local). Residual: rolling happens only while the app is foregrounded, so the tray appears on next look, not at 00:00; that is an accepted platform limit, not a bug. **Re-verified end to end in headless Chrome on 2026-08-10, not just in jsdom**: seeded an unfinished task on yesterday with a stale `lastRoll`, and at both 390px and 1280px the tray rendered with the right items, kept the finished task on its day, showed correct origin labels ("Prio 0 · Sun"), placed every triage control in the viewport with `elementFromPoint` returning the control itself, and a real click on "Today" moved the task to today's Prio 0. The feature is genuinely working. Anyone reporting it "broken" has almost certainly hit the once-per-day gate (Section 3, item 11) rather than a defect.
- **Tab delete control missing** (fixed `c21bff6`): never broke; it had shipped with an empty label since the initial commit and rendered at 10x4px. Fixed with a label and a test asserting visible text, plus the same fix applied when the tray's "Free Floating" button was found blank earlier. Two blank-button bugs from the same cause suggests scanning for empty interactive elements belongs in the visual suite; it is not there yet.

Pattern worth naming: two of the five were latent from day one and only surfaced when adjacent behavior changed. The suite now pins each one, but the class of bug (markup present, visually absent; feature keyed to a lifecycle that stopped happening) is what to watch for.

## 6. Test coverage

372 assertions, jsdom, all logic-level. Genuinely covered: zone locking, quick add, subtasks, tabs (including delete/undo/last-tab guard), carry-over incl. the day turning under a live window, calendar add, metrics math, export/import round-trip, the merge (unit fixtures for add/edit/delete/offline/three-way/legacy, plus a two-window end-to-end with a fake fetch, offline, and bin restore propagation), the inline-add mobile behavior, phone-viewport board nav, the full bin lifecycle. Mutation-testing has been done ad hoc (revert fix, confirm failures) for each major fix.

Not covered, specifically:

- **Drag and drop entirely** (`dragstart`/`dragover`/`drop`, `index.html:2060+`): task moves, subtask re-parenting, and the two subtask-conversion branches with their `ui.skipBin` marks. jsdom cannot exercise real DnD; nothing simulates the events either.
- **The `conflict` sync state**: `connectKey` where both device and cloud hold planners, the conflict modal, and Pull/Push as the resolution. Untested end to end.
- **`carry-one`** (single-task triage button) has no test; `carry-all` and `carry-drop` do.
- **Service worker**: `sw.js` has zero tests; cache-bump discipline is unverified by tooling.
- **Multi-day gaps in rollover** (device off for a week) is asserted only via unit merge fixtures, not through `rollIfNewDay`.
- **Tray behaviour under a manual Pull.** That an automatic merge leaves the tray intact is now asserted (Exception A test); that a manual **Pull** empties it with Undo was established by driving Chrome and is asserted nowhere.
- **The `roll-now` affordance beyond the happy path**: covered for appear, count, press, disappear, but not for the case where it is pressed while a sync cycle is mid-flight.
- **Rendering/layout**: everything geometric was verified manually via ad-hoc Chrome CDP scripts during development (390px and 1280px), but none of that is committed; `visual.py` predates recent UI additions (tray restyle, bin modal, 5-button rail foot) and cannot run on this machine anyway.
- **Clipboard (`sync-copy`), localStorage quota failure, `beforeunload` flush, the 25s poll timer itself** (cycles are invoked directly in tests).

## 7. Mobile and iOS

Verified on real Chrome (headless, device metrics 390x844, and 1280px) during development: inline add, board nav, tab header targets, action bar wrap, rail foot wrap, tray stacking, bin modal. Verified only in jsdom with faked widths: everything else.

Carry-over tray, measured 2026-08-10 at 390x844: panel top at y=237, height 296, width 362, **fully inside the first viewport with no scrolling**, with only the rail and the quick-add box above it. All eight triage controls 36px tall, all inside the viewport, and `document.elementFromPoint` at each control's centre returned that control, so nothing overlaps them. No horizontal overflow. A synthetic click on "Today" moved the task to today's Prio 0. At 1280px the tray sits at y=68 with only the quick-add above it.

Known device-conditional behavior: layout branches at `window.innerWidth<900` in several functions (`windowDays`, `renderNav`, `goto-day`); hover styles are gated behind `@media (hover:hover)`; keyboard-driven resizes are ignored by design (width-only re-render).

**Nothing in this project has ever been verified on a physical iOS device.** The "iOS bug" turned out to be width-dependent, so the fix is believed device-independent, but Safari-specific behaviors remain unexercised: the `beforeunload`/`visibilitychange` commit path under Safari's aggressive tab freezing, `navigator.onLine` accuracy, date-input UX (`jumpDate`, `pickdate`), clipboard fallbacks in the sync modal, and PWA cache adoption timing after a `CACHE` bump (users must fully close the app; nothing in-app prompts them). The 60s `rollIfNewDay` timer does not run while iOS suspends the page; foreground events cover it, which is accepted.

## 8. Risk list, ranked

Risks 1, 3 and 9 from the previous revision are fixed. This is the list as it now stands.

1. **An old client still strips newer keys during the window before every device updates.** The pass-through fix only helps clients running it. A device on a cached build older than `v19` reconstructs from its own whitelist and will drop `pos` (degrading merges gracefully back to the old combined behaviour) and `bin`. Exposure is bounded: the stripped key goes from the cloud copy, but the first updated client to sync restores it from its own local copy, so permanent loss needs the cloud to be the only holder, e.g. a fresh install that pulls before it has ever had a copy of its own. The manual cache-bump ritual decides how long the window lasts.
2. **Clock skew** flips every last-write-wins decision, now on two axes rather than one; there is no server-time anchor at all.
3. **`ui.skipBin`/`ui.binNote` debounce race** can misfile conversions into the bin or attribute a moved tab's annotation to the wrong commit; rare, silent, untested.
4. **Title vs tick on the same task still has a loser** (Section 3, item 1), because `done` and `title` share the `up` stamp. Now the most likely remaining "sync ate my edit" report; splitting `done` onto a third axis would close it.
5. **Concurrent PUT race** leaves the cloud transiently missing one device's changes with no version check; converges only if the losing device syncs again.
6. **Untested drag and drop** sits directly on top of the merge's most subtle contract (id survival vs conversion); a regression there corrupts sync state, not just UI.
7. **The 65-case click handler's return/break convention**: the next case added with the wrong exit either double-renders or never saves, and only manual testing would notice the latter.
8. **A new field on an item must be classified twice** (Section 4): once into `sigC`/`sigP`, once into `CONTENTF`/`POSF`. Nothing enforces the pairing, and getting it wrong loses edits silently.

## Housekeeping notes

- CLAUDE.md's expected test count (currently "333 passed") must be hand-bumped every time tests are added; it has drifted before and will again.
- `SETUP.md`/`START-HERE.md` predate sync, the tray changes, and the bin, and have not been re-verified.
- To make the tray appear on demand without waiting for midnight: `A.rollover(); A.save(); A.render()` in the console, or set `A.state.settings.lastRoll` to an older date, save, and switch away from the tab and back. Both were confirmed working on 2026-08-10.
