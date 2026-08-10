# Headspace, technical review

State of the code as of the commit that added the custom pickers (2026-08-10). Written for a reviewer who has not read the file. Line numbers refer to `index.html` at this commit and will drift; section names and function names are the stable handles. This is a critical review, not a status report: the Weak points and Risk list sections are the ones to read first.

## 1. Structure

One file, `index.html`, 2524 lines: CSS to line 487, static HTML to 540, then one `<script>` to the end. No modules, no build. `sw.js` (36 lines) is a cache-first service worker keyed on a manually bumped `CACHE` constant. Tests are `tests/test.js` (1404 lines, jsdom) plus `tests/visual.py` (109 lines, Playwright, currently unrunnable: no Python on the dev machine).

Script sections in order. These line numbers drift with every commit; regenerate with `grep -n "^/\* =\{5,\}" index.html`, which is where they came from.

| Lines | Section |
|---|---|
| 542–558 | helpers |
| 559–570 | state globals (`state`, `ui`), `fresh()` |
| 571–690 | per-item change tracking: `eachItem`, `sigC`/`sigD`/`sigP`, `snapSigs`, `stampChanges`, `stampLegacy` |
| 691–894 | merge: `flatten`, `pickSide`/`pickNewer`, `mergeTombs`, `stateSig`, `mergeStates`, `mergeBins`, `carryUnknown`, `rebuild`, then `load`/`save`/`commit` and the lifecycle hooks |
| 895–1228 | Supabase sync: REST calls, `pushSoon`/`flushPush`/`putState`, `applyCloud`, `syncCycle`, 25s poll, connect/forget, sync modal |
| 1229–1336 | data ops (`findTask`, `pull`, `place`, `move`, `rollover`, `pastOpenCount`, `rollIfNewDay`), toast/undo |
| 1337–1483 | recycle bin: `binCapture`, restore/purge/empty, bin modal |
| 1484–1884 | metrics + all render functions, master `render()` |
| 1885–2168 | the delegated click handler and `change` handler |
| 2169–2252 | keyboard, blur (rename commit), drag and drop |
| 2253–2447 | custom pickers, desktop pointer only: popover layer over `#jumpDate`, the per-task `pickdate` input and the `#qd` select |
| 2448–2524 | modals (help, tab-delete confirm), autogrow, resize, boot |

State flow: every mutation goes `handler mutates state -> save() (400ms debounce) -> commit() -> stampChanges() diff -> localStorage -> pushSoon() (1800ms debounce) -> syncCycle()`. Rendering is full `innerHTML` rebuild of each region on every `render()`.

Grown unwieldy:

- The delegated click handler (`index.html:1904`) is ~224 lines and 65 `case`s with two exit conventions: `return` means the case handled its own save/render, `break` falls through to a shared `save(); render()`. Picking the wrong one is an easy, silent mistake, and the pre-switch block that closes the inline add field (added for the mobile trap fix) runs a deferred `save(); render()` in a `setTimeout(0)` that has to guess whether a rename just started by sniffing `document.activeElement.dataset.kind`. It works and is tested, but it is the most fragile control flow in the file.
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
Task = { id, title, done, subtasks:[{id,title,done,up,dn,pos}], up, dn, pos, from? }
```

Every mergeable item carries **three** stamps, merged independently (Section 3):

| Stamp | Covers | Declared in |
|---|---|---|
| `up` | title, or a tab's name | `CONTENTF`, `sigC` |
| `dn` | `done`, and a focus item's `doneAt` | `DONEF`, `sigD` |
| `pos` | location, order in its list, a task's `from` label | `POSF`, `sigP` |

Anything written before a split has only the older stamps; `posOf()`/`dnOf()` fall back to `up`, and `stampLegacy()` backfills both at load, so a split becomes fully active after one save.

Synced vs local:

- **Merged item-by-item:** everything under `days`, `carry`, `focus`, `floats` (tasks, subtasks, tabs), plus `tomb` and `bin`.
- **Device-local under merge:** the entire `settings` object. `rebuild()` (`index.html:807`) takes only `mine.settings`. `VIEWSET` (`index.html:904`) is used only by the manual-Pull path (`applyCloud`) to keep local view state while importing the rest of the remote settings. So merge and manual Pull treat settings differently; that asymmetry is deliberate but undocumented outside this file.
- **localStorage, never in the cloud blob:** the sync key (`agora_dayplanner_synckey`), agreement stamp (`agora_dayplanner_syncstamp`), pre-pull backup (`agora_dayplanner_v1_backup`).

**Unknown top-level keys now pass through (fixed, was the headline risk).** `rebuild()` still reconstructs the keys it understands, declared in `MERGED_KEYS`, but it ends with `carryUnknown(out, mine, theirs)`, which copies through every top-level key neither side's merge logic knows about. A key added to `state` in future therefore survives a merge instead of being silently dropped. It gets no last-write-wins (there are no stamps for it): whichever side has it wins, and if both differ the smaller JSON wins, which is arbitrary but identical on both devices, so they still converge. `stateSig()` hashes unknown keys too, so a change to one still triggers a push. A test asserts `MERGED_KEYS` still matches `Object.keys(fresh())`, so adding a key to the canonical shape fails the suite until someone decides whether it needs real merge semantics or the generic pass-through is fine.

## 3. Sync and merge

Mechanics: one Supabase row per sync key, whole-state JSON in `data`, publishable API key embedded in the page. `syncCycle()` (`index.html:1090`) runs on boot, focus/visibility, reconnect, a 25s poll, and 1.8s after any edit. It does GET, `mergeStates(local, cloud)`, adopts the merge if it changed anything, and PUTs if the cloud is missing anything, comparing via `stateSig`. The Push/Pull buttons are raw overwrites in both directions (documented in the sync modal); Pull backs up to `agora_dayplanner_v1_backup` and offers toast-undo.

Merge rules: union by id. Per item, **title, tick and position are resolved separately**: the side with the newer `up` supplies the title, the newer `dn` supplies the tick, the newer `pos` supplies location/order/`from`, and `pickNewer()` splices the three together. Equal stamps break by JSON comparison of just the fields under that stamp, so both devices agree. A tombstone kills anything whose `up` **and** `dn` are both older than the deletion: editing or ticking asserts the item exists, moving it does not. `stampChanges()` assigns all three by diffing a structured signature (`{c,d,p}`, no separator to collide with user text) at commit time, so every mutation path is covered without instrumentation. Subtasks are not listed in their parent's signature, so adding a step does not restamp the task it belongs to. Bin entries follow their tombstones; purge markers are terminal.

Cases resolved by an arbitrary rule or still able to lose data:

1. **Two edits to the same field: later stamp wins, the loser is silently discarded.** Now genuinely narrow. Rename versus tick is fixed (`dn` is its own axis), as is either versus a move. What remains within edit-versus-edit is same-field-versus-same-field: two devices **renaming the same task** to different text, two **ticking it differently** (an untick after a tick, and the later one wins), or two **moving it to different places**. One side loses, with no record and no merge UI. Renaming two *different* tasks, or renaming one while ticking or moving it, all survive intact. Delete conflicts have losers of their own, item 4.
2. **Reorder vs content edit, and rename vs tick: both fixed.** The signature was split three ways (`sigC`/`sigD`/`sigP`) with a stamp each. A reorder bumps only `pos`, a rename only `up`, a tick only `dn`, so none can discard another, in any direction, and all three compose on one task at once. Tested fourteen ways, including every mirror case and convergence. Reverting either split fails six assertions each.
3. **Move vs rename: fixed** by the same split. The task lands in the newly moved-to place carrying the newly typed text.
4. **Edit or tick after delete resurrects** (deliberate, tested). Ambiguous case: the stamps and the tomb are compared across devices with unsynchronized clocks. **A reorder or a move no longer resurrects a deleted item**, since the tombstone is compared against `up` and `dn` only; editing or ticking asserts the item should exist, shuffling it does not. **Revival is strictly per item: work on a subtask does not defend its deleted parent.** Delete a task on one device while another ticks one of its steps, or adds a brand new one, and the steps die with the parent, silently, with no bin entry anywhere in the merged state; `rebuild()` drops any surviving step whose parent was not kept ("never orphan a step", `index.html:826`), even a step whose own `dn` beat the tombstone. Conversely a parent revived by its own rename comes back with zero steps, since its old steps were tombed individually and nothing re-asserted them. Confirmed by hand against `mergeStates` on 2026-08-10, both merge directions converge; not pinned by a test.
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
- **Three stamps per item now, and all three must be maintained.** `stampChanges` writes `up`, `dn` and `pos` from a three-part signature; a future field added to an item must be classified into `CONTENTF`/`DONEF`/`POSF` (used by `pickNewer` for tie-breaks) *and* into `sigC`/`sigD`/`sigP` (used to decide which stamp moves). Miss the signature and the field never triggers a stamp, so edits to it silently lose merges. Nothing enforces the pairing; a test that round-trips every field through a merge would.
- **The custom picker layer has two contracts nothing enforces.** On hover:hover devices a popover replaces the native date popup and the `#qd` dropdown (the natives are unstylable and OS blue); the native inputs and all their handlers stay untouched, the popover writes `value` and fires the same bubbling `change`. Contract one: while a popover is open, a capture-phase keydown handler owns Enter, Space, arrows, Escape and Tab and stops propagation, so a future global key feature must check the layer's `pop` state or it will never see those keys. Contract two: a capture-phase click handler swallows clicks on the three anchor controls (the `pickdate` input carries a `data-action`, and its raw click used to fall through the delegated switch into a stray `save()+render()` that closed the popover through the board scroll reset), so giving those anchors real click behaviour in the delegated switch will silently not work on desktop. Both contracts are pinned by tests. A third choice is deliberate: after a mouse pick the date input is left unfocused, since Chrome paints the focused segment highlight in OS blue and no CSS reaches it; keyboard flows do restore focus, and that highlight is then the focus indicator.
- **Two-field board position** (`boardOffset` for wide, `stripDay` for narrow) still exists; `shiftBoard()`/`showDay()` keep them in step at the five current call sites, but `windowDays()` (`index.html:1627`) still branches on `window.innerWidth<900`, so any new navigation control must go through the helpers or it will regress exactly like Prev/Next did on iOS.
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

434 assertions, jsdom, all logic-level. **The suite asserts its own count against the `expect` line in CLAUDE.md**, so that number cannot drift again: add a test and the suite fails with the number to write down. Chosen over a generator script for the structural facts because it is self-enforcing rather than something someone has to remember to run; the line-number table in Section 1 is still hand-updated, with the `grep` that produces it recorded there. Genuinely covered: zone locking, quick add, subtasks, tabs (including delete/undo/last-tab guard), carry-over incl. the day turning under a live window, calendar add, metrics math, export/import round-trip, the merge (unit fixtures for add/edit/delete/offline/three-way/legacy, plus a two-window end-to-end with a fake fetch, offline, and bin restore propagation), the inline-add mobile behavior, phone-viewport board nav, the full bin lifecycle, and the custom pickers (open and choose by mouse and by keyboard for both controls, grouping and labels mirror the live select, Escape cancels without touching the value or the selected card, outside press closes, focus return on keyboard flows, the pointer gate off, and the stray-click regression found in real Chrome). Mutation-testing has been done ad hoc (revert fix, confirm failures) for each major fix.

Not covered, specifically:

- **Drag and drop entirely** (`dragstart`/`dragover`/`drop`, `index.html:2209+`): task moves, subtask re-parenting, and the two subtask-conversion branches with their `ui.skipBin` marks. jsdom cannot exercise real DnD; nothing simulates the events either.
- **The `conflict` sync state**: `connectKey` where both device and cloud hold planners, the conflict modal, and Pull/Push as the resolution. Untested end to end.
- **`carry-one`** (single-task triage button) has no test; `carry-all` and `carry-drop` do.
- **Subtask work versus a concurrent parent delete** (Section 3, item 4): verified by hand against `mergeStates` in both directions, asserted nowhere.
- **Service worker**: `sw.js` has zero tests; cache-bump discipline is unverified by tooling.
- **Multi-day gaps in rollover** (device off for a week) is asserted only via unit merge fixtures, not through `rollIfNewDay`.
- **Tray behaviour under a manual Pull.** That an automatic merge leaves the tray intact is now asserted (Exception A test); that a manual **Pull** empties it with Undo was established by driving Chrome and is asserted nowhere.
- **The `roll-now` affordance beyond the happy path**: covered for appear, count, press, disappear, but not for the case where it is pressed while a sync cycle is mid-flight.
- **Rendering/layout**: everything geometric was verified manually via ad-hoc Chrome CDP scripts during development (390px and 1280px), but none of that is committed; `visual.py` predates recent UI additions (tray restyle, bin modal, 5-button rail foot) and cannot run on this machine anyway.
- **Clipboard (`sync-copy`), localStorage quota failure, `beforeunload` flush, the 25s poll timer itself** (cycles are invoked directly in tests).

## 7. Mobile and iOS

Verified on real Chrome (headless, device metrics 390x844, and 1280px) during development: inline add, board nav, tab header targets, action bar wrap, rail foot wrap, tray stacking, bin modal. Verified only in jsdom with faked widths: everything else.

Custom pickers, verified in headless Chrome on 2026-08-10 with real mouse and key dispatch: at 1280x800 both popovers open inside the viewport, carry no `rgb(255,255,255)` in any computed color, drive the underlying controls through their existing change handlers, and the per-task picker floats over a horizontally scrolled board unclipped (`elementFromPoint` at its centre lands inside it, the board's scroll container cannot cut it off since the popover is position:fixed in `#popRoot`). At 390x844 with a fine pointer both fit the viewport. Under emulated touch (hover none, pointer coarse) neither layer engages and the native pickers remain, which is the intended split: the gate is the same hover:hover condition the CSS keys its hover states on, pointer-based rather than width-based, so a narrow desktop window still gets the custom UI and a tablet in a wide window does not.

Carry-over tray, measured 2026-08-10 at 390x844: panel top at y=237, height 296, width 362, **fully inside the first viewport with no scrolling**, with only the rail and the quick-add box above it. All eight triage controls 36px tall, all inside the viewport, and `document.elementFromPoint` at each control's centre returned that control, so nothing overlaps them. No horizontal overflow. A synthetic click on "Today" moved the task to today's Prio 0. At 1280px the tray sits at y=68 with only the quick-add above it.

Known device-conditional behavior: layout branches at `window.innerWidth<900` in several functions (`windowDays`, `renderNav`, `goto-day`); hover styles are gated behind `@media (hover:hover)`; keyboard-driven resizes are ignored by design (width-only re-render).

**Nothing in this project has ever been verified on a physical iOS device.** The "iOS bug" turned out to be width-dependent, so the fix is believed device-independent, but Safari-specific behaviors remain unexercised: the `beforeunload`/`visibilitychange` commit path under Safari's aggressive tab freezing, `navigator.onLine` accuracy, date-input UX (`jumpDate`, `pickdate`), clipboard fallbacks in the sync modal, and PWA cache adoption timing after a `CACHE` bump (users must fully close the app; nothing in-app prompts them). The 60s `rollIfNewDay` timer does not run while iOS suspends the page; foreground events cover it, which is accepted.

## 8. Risk list, ranked

Risks 1, 3 and 9 of the revision before last are fixed, as is risk 4 (title vs tick) of the last one. This is the list as it now stands.

1. **An old client still strips newer keys during the window before every device updates.** The pass-through fix only helps clients running it. A device on a cached build older than `v19` reconstructs from its own whitelist and will drop `pos` (degrading merges gracefully back to the old combined behaviour) and `bin`. Exposure is bounded: the stripped key goes from the cloud copy, but the first updated client to sync restores it from its own local copy, so permanent loss needs the cloud to be the only holder, e.g. a fresh install that pulls before it has ever had a copy of its own. The manual cache-bump ritual decides how long the window lasts.
2. **Clock skew** flips every last-write-wins decision, now on two axes rather than one; there is no server-time anchor at all.
3. **`ui.skipBin`/`ui.binNote` debounce race** can misfile conversions into the bin or attribute a moved tab's annotation to the wrong commit; rare, silent, untested.
4. **Concurrent PUT race** leaves the cloud transiently missing one device's changes with no version check; converges only if the losing device syncs again.
5. **Untested drag and drop** sits directly on top of the merge's most subtle contract (id survival vs conversion); a regression there corrupts sync state, not just UI.
6. **The 65-case click handler's return/break convention**: the next case added with the wrong exit either double-renders or never saves, and only manual testing would notice the latter.
7. **A new field on an item must be classified twice** (Section 4): once into `sigC`/`sigD`/`sigP`, once into `CONTENTF`/`DONEF`/`POSF`. Nothing enforces the pairing, and getting it wrong loses edits silently.
8. **The picker layer intercepts input at capture phase** (Section 4): a future global keyboard feature that misses the `pop` check, or a click behaviour added to one of the three anchor controls, fails silently and only on desktop. Low likelihood, but the failure would look exactly like the two blank-button bugs: present in code, absent in behaviour.
9. **The merge still has two data-loss classes, not one.** Same-field concurrent edits lose one side (Section 3, item 1): two devices renaming the same task, ticking it differently, or moving it to different places; unavoidable without a merge UI. And subtask work loses to a concurrent parent delete (Section 3, item 4): a step ticked or added under a task another device deleted vanishes with no bin entry. The first is inherent; the second is a chosen rule ("never orphan a step") that could instead have revived the parent, and it is not pinned by a test.

## Housekeeping notes

- CLAUDE.md's expected test count is now checked by the suite itself, so it can no longer drift silently.
- `SETUP.md`/`START-HERE.md` predate sync, the tray changes, and the bin, and have not been re-verified.
- To make the tray appear on demand without waiting for midnight: `A.rollover(); A.save(); A.render()` in the console, or set `A.state.settings.lastRoll` to an older date, save, and switch away from the tab and back. Both were confirmed working on 2026-08-10.
