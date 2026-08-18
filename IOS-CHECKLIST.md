# Manual device checklist

Everything here needs a physical device: an iPhone with Safari as the primary target, an iPad for the rotation item, and one Android tablet for the two cross-platform items (5 and 11). Headless Chrome has already verified every flow at six viewport and input profiles, with hit sizes, overflow, labels and palette measured; what it cannot verify is Safari itself (PWA install and cache adoption, tab freezing, native pickers, the on-screen keyboard and autocorrect), a real finger's accuracy against the invisible hit overlays, or two physical devices syncing. These are the gaps, highest risk first. When something fails, report the item number, the exact step, and a screenshot; "item 4, step 3, the caret jumped to the end after Bold" is enough to act on.

Before starting: check the deployed version (the `CACHE` constant in `sw.js` names it) and know today's task list so stale data is recognisable. Items 1 and 2 need a second device, item 3 spans a night; everything else is one sitting. Item 2's second half wants one of the two devices offline for a few minutes, so read it before you start. Budget: about 45 minutes for the sitting, 20 more for item 2, plus the overnight check.

## 1. Update pickup after a cache bump

Stakes are higher since Notes gained formatting: a stale build does not merely lag, it shows formatted notes as raw angle-bracket markup and strips pins and page styles from its merges.
Steps: with the app installed and a note formatted somewhere in the planner, open Notes. If you see literal `<div>` or `<b>` text, you are on a stale build. Fully close the app (app switcher, swipe away), wait ten seconds, reopen. Check again.
Correct: after one full close and reopen at the latest, the note renders formatted and the toolbar is present above the body.
Failure looks like: raw markup still visible after a full close, or needing to delete and reinstall the icon. Count the close cycles; that number decides whether the app needs an in-app update prompt.

## 2. Rich-text notes across two real devices

Steps: connect two devices with a sync key. On A, write a note with a title, a bold word, one highlight, a dashed list, and the ruled page. Wait half a minute with B foregrounded, open the note on B. On B, add a plain sentence at the end of the same body; wait, check A. Then on A pin the note and rename its title while on B switching the page to dotted; give both a minute to settle.
Correct: B shows the formatting exactly as A wrote it, ruling included. B's body edit arrives on A with the formatting intact (the later body wins whole; A's bold survives because it is part of that body). Pin, rename and page style all survive on both; a rename and a page flip made in the same instant may resolve to one device's pair, but nothing scrambles and markup never shows as literal text.
Failure looks like: visible markup on either device, formatting lost after B's edit, a body reverting to an older version, or duplicated notes. Note the direction, A to B or B to A.

Then, on the same pair, the tick against the roll. This is the acceptance test for the merge repair, and it needs two real devices because one device cannot produce the state at all: rollover leaves finished tasks on their day and the tray has no tick, so only a tick made HERE composing with a roll made THERE can put a done task in the carry tray.
Steps: leave one unfinished task on today, on both devices, and put B in airplane mode. Wait for midnight to pass with A open (or, to do it in daylight, set today's task back a day on A with the date field so it is on a past day, then use "N waiting on past days" on A only). A now holds the task in its carry tray. With B still offline, tick that same task on B, where it is still sitting on its day. Bring B back online and give both a minute.
Correct: on both devices the task ends up ticked and ON ITS DAY, struck through, and the carry tray does not list it. If the tray holds nothing else, it draws nothing at all. Both devices agree, and they still agree after a further minute.
Failure looks like: the finished task appearing as a row in the carry tray on either device (that is the bug this repairs; screenshot it and say which device ticked and which rolled), the tick lost, the task on a day nobody put it on, or the two devices settling on different answers.

## 3. Carry-over tray after an overnight suspension

Steps: in the evening leave at least one task unfinished on today, and tick one so there is a finished one too. Press "Today only" so the board is the single column, so this one night covers the mode as well. Do not close the app, just lock the phone. Next morning open it from the app switcher, not a fresh launch.
Correct: within a moment of foregrounding, a collapsed "Carry-over" bar appears with the marker dot and an "N waiting" count, and nothing else: no item rows and no triage buttons until you press the bar. Press it: yesterday's unfinished task is there with its origin label, and the count matches what is listed. The task you ticked is NOT in the tray: step back a day with Prev, and it is still on yesterday's column, struck through. Today's date is current on the board, the strip and the calendar.
Failure looks like: yesterday still showing as today, the tray missing until a kill and relaunch, wrong origin labels, the tray arriving already OPEN with its rows on screen (it must arrive collapsed however you left it the night before), a finished task listed in the tray, or a count that disagrees with the rows once opened.

The same morning, still in the mode: the one column is the NEW today, with the TODAY badge on it, at full strength, and the Prev/Next pair still steps a single day. Press "Today only" to leave the mode: the seven day window opens with today in it, on the left, not on tomorrow.
Failure looks like: the single column still showing yesterday's date, drawn faded as a past day with no badge; or leaving the mode landing on a week that does not contain today. The 60 second timer does not run while iOS suspends the page, so this is the same foreground path as above and the same one item settles both.

## 4. Notes with the on-screen keyboard, autocorrect and the caret

Steps: open a note, tap into the middle of the body. Type a sentence with autocorrect on, letting it correct at least one word. Select a word with the native handles, tap Bold, then a highlight swatch. Keep typing after the formatted word. Scroll with the keyboard up. Switch the page style with the keyboard up. Close the note, reopen it.
Correct: the caret lands where taps put it; autocorrected words are in the note after reopening; the toolbar formats the selected word without the selection collapsing or the keyboard dropping; typing after a bold word continues in bold; the ruling scrolls with the text.
Failure looks like: the caret jumping to the start or end after a toolbar tap, corrected words missing after reopen (Safari composition landing outside the input event path), the keyboard closing on a toolbar tap, or the selection gone so Bold applies to nothing. No headless pass exercises Safari's IME; this surface is genuinely unverified.

## 5. The 44px targets under a real finger

Steps: on the iPhone AND the Android tablet, tap casually, one-thumbed, without aiming: a task tick box, a subtask tick, a delete mini, each button in a task's action bar, a habit day cell and then the Days button directly above it, a collapsed panel header, the carry-over tray's header bar (on its label text, not only on the chevron, and both to open it and to close it again), the ✕ that drops a carried task next to the two wide buttons beside it, the "Today only" switch in the board nav row, every Notes toolbar button across its row, a note row, and the search box.
Correct: every intended control fires on the first casual tap, and Days never ticks the habit cell beneath it. The tray header toggles in both directions from anywhere along the bar. The tray's ✕ does not fire when "Free Floating" beside it was the target.
Failure looks like: any control needing a second aimed tap, or a neighbour firing instead (say which pair). The invisible hit overlays were measured at 44px in Chrome but have never met a finger; this is the item that settles them.

## 6. Install to the Home Screen

Steps: open the GitHub Pages URL in Safari. Share, "Add to Home Screen", Add, open from the icon.
Correct: the app mark on the tile, full screen with no address bar, cloud blue behind the status bar, and the Safari visit's data present.
Failure looks like: a generic icon, an address bar, white flashes or bars, or an empty planner after install.

## 7. The date inputs

Steps: tap Jump to's date field, pick a date a month out with the iOS wheel. Then open a task's action bar, tap the mm/dd/yyyy field, pick tomorrow.
Correct: the wheel opens on the first tap both times, the board jumps, and the task moves keeping its Prio.
Failure looks like: a dead first tap (note whether the second works), a choice not applying, or a task changing zone on the move.

## 8. Offline open

Steps: with the app installed and opened once, enable airplane mode, fully close, reopen from the Home Screen, add a task, then reconnect and wait half a minute.
Correct: instant offline open with all data, the task saves, and it uploads after reconnecting if sync is on.
Failure looks like: a cannot-connect page, an empty planner, or the offline task lost.

## 9. Rapid close after typing

Steps: type a task in quick add, press Add, swipe the app away within a second, reopen. Then type half a sentence into a note body and swipe away mid-word, reopen.
Correct: both survive. The visibility-change commit fires before the debounce would have; the note case is the wider window (typing defers the commit until a pause), so it is the sharper test.
Failure looks like: either one gone. If the task survives and the note loses its tail, report roughly how many words vanished; that measures the deferred-commit window on real Safari.

## 10. True north on a small screen

Steps: open the Menu, set a True north statement, close and reopen the Menu, then try to collapse the panel by tapping its header.
Correct: with a statement present the panel shows no chevron and the header does not collapse it; the statement is fully readable. Set it aside: once the panel holds nothing current it folds to a "not set" header bar.
Failure looks like: a collapse with content present, a statement clipped or truncated, or the panel loading collapsed while holding a statement.

## 11. Tab reorder by touch

Steps: on the iPhone and the Android tablet, in Free Floating, press a tab header and drag sideways, slowly, then again fast.
Correct: nothing reorders and nothing breaks: the page scrolls or nothing happens, no drag ghost, no cue bars, and the tab order is unchanged after both attempts. Touch reorder is a documented, deliberate gap (REVIEW risk 12), not a bug; this item verifies the gap is inert rather than destructive.
Failure looks like: a stuck half-drag state, cue bars left behind, or the order actually changing.

## 12. Copying the sync key

Steps: in Sync, tap the copy control next to the generated key, paste into any notes app.
Correct: the full key pastes.
Failure looks like: an empty paste with a success toast, or the select-by-hand fallback appearing when the tap should have copied. Clipboard rules differ inside installed apps; this is the one place the app writes the clipboard.

## 13. Rotation while typing (iPad)

Steps: open the inline "+ add" in a day column, type half a task, rotate, finish, commit. Then repeat inside a note body: type mid-sentence, rotate, keep typing.
Correct: text survives both rotations, focus stays or returns, and in the note the caret is still where you left it.
Failure looks like: a field closing with text lost, or the note caret jumping on rotation. A brief keyboard flicker is a known accepted quirk; text or caret loss is not.
