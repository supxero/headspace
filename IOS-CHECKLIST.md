# iOS manual checklist

Everything here needs a physical iPhone or iPad with Safari. Headless Chrome has verified these same flows work in Chromium at four viewport and input profiles; what it cannot verify is Safari's own behaviour: its PWA install and cache adoption, its tab freezing, its native pickers, and its keyboard. These are the gaps, highest risk first. When something fails, report the item number, what you saw at the exact step, and a screenshot; "item 4, step 3, the tray did not appear until I killed and reopened the app" is enough to act on.

Before starting: have the current version deployed (check the footer of a desktop tab against `sw.js`, the `CACHE` constant names the version), and know today's task list so you can tell stale data from fresh.

## 1. Install to the Home Screen

Steps: open the GitHub Pages URL in Safari. Share button, then "Add to Home Screen", then Add. Open it from the new icon.
Correct: the icon is the app mark on a dark tile, not a Safari thumbnail. It opens full screen with no Safari address bar, the cloud blue theme fills the screen including behind the status bar, and your tasks from the Safari visit are there.
Failure looks like: a generic blank icon, an address bar visible inside the app, a white flash or white bars top or bottom, or an empty planner after install when Safari had tasks.

## 2. Update pickup after a cache bump

Steps: with the app installed, note the current behaviour somewhere visible. Wait for a deploy that bumps `CACHE` in `sw.js`. Open the installed app and check whether the change is there. If not, swipe the app away fully (app switcher, swipe up), wait ten seconds, reopen. Check again.
Correct: the new version appears after the full close and reopen at the latest. One stale open immediately after deploy is expected; a full close must always pick it up.
Failure looks like: still the old version after a full close and reopen, or needing to delete and reinstall the icon to see updates. Note how many close cycles it took; this decides whether the app needs an in-app update prompt.

## 3. Sync across two devices

Steps: on device A open Sync, generate a key, copy it. On device B open Sync, paste the key, connect. Add a task on A, wait half a minute with B open. Tick a task on B, wait, check A. Then put A in airplane mode, add a task, leave airplane mode, wait with both open.
Correct: each change appears on the other device within about thirty seconds while both are open in the foreground. The airplane task arrives after reconnecting. Nothing duplicates and nothing disappears.
Failure looks like: changes only arriving after a manual close and reopen, duplicated tasks after the airplane step, or the sync status stuck on connecting. Note which direction failed, A to B or B to A.

## 4. Carry-over tray after an overnight suspension

Steps: in the evening leave at least one task unfinished on today. Do not close the app, just switch away or lock the phone. Next morning, open the app from the switcher, not a fresh launch.
Correct: within a moment of the app coming to the foreground the carry-over tray appears with yesterday's unfinished task, labelled with its origin, and today's date is current everywhere: the board header, the strip, the calendar.
Failure looks like: the board still showing yesterday as today, the tray missing until you kill and relaunch, or the tray appearing with wrong origin labels. The 60 second timer does not run while iOS suspends the page; the foreground path is supposed to cover it. This item tests exactly that.

## 5. The date inputs

Steps: on the board tap Jump to's date field, pick a date a month away with the iOS wheel, confirm the board jumps. Then open a task's action bar, tap the mm/dd/yyyy field, pick tomorrow, confirm the task moves and keeps its Prio.
Correct: the native iOS date wheel opens on the first tap, the chosen date applies immediately, and the action bar's date move preserves the task's zone.
Failure looks like: a tap doing nothing (report whether a second tap works), the wheel opening and the choice not applying, or the task landing in the wrong Prio. On a phone these are the native pickers by design; the custom popover is desktop only.

## 6. Offline open

Steps: with the app installed and opened at least once, enable airplane mode. Fully close the app. Reopen it from the Home Screen. Add a task while offline. Disable airplane mode, leave it open half a minute.
Correct: the app opens instantly with all data while offline, the new task saves, and if sync is connected it uploads after reconnecting.
Failure looks like: a Safari cannot-connect page, an empty planner offline, or the offline task lost after reconnecting.

## 7. Rapid close after typing

Steps: type a new task in the quick add box, press Add, and within a second swipe the app away completely. Reopen.
Correct: the task is there. The save path commits on visibility change, before the debounce would have fired.
Failure looks like: the task gone after reopening. If it is, also try the same with a two second pause before swiping away, and report which survived; that distinguishes the debounce window from a frozen-tab commit failure.

## 8. Copying the sync key

Steps: in Sync, tap the copy control next to the generated key. Paste into Notes.
Correct: the full key pastes.
Failure looks like: an empty paste with the toast claiming success, or the fallback toast asking you to select the key by hand even though tapping should have copied. Safari's clipboard rules differ inside installed apps; this is the one place the app writes the clipboard.

## 9. Rotation while typing

Steps: on an iPad, open the inline "+ add" in a day column, type half a task, rotate the device, finish typing, commit.
Correct: the half-typed text survives the rotation, focus stays or returns to the field, and the keyboard does not flicker away permanently.
Failure looks like: the field closing and the text lost on rotation. A brief keyboard flicker is a known accepted quirk; text loss is not.
