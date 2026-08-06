# Headspace Day Planner: setup

Six files. Fifteen minutes. At the end you have a real app icon on your phone that opens full screen with no browser bars, and the same planner on your laptop.

---

## What is in the folder

| File | What it does |
|---|---|
| `index.html` | The whole app |
| `manifest.webmanifest` | Tells the phone the name, icon, and that it opens full screen |
| `sw.js` | Lets the app open with no signal |
| `icon-192.png` | Home screen icon |
| `icon-512.png` | Large icon |
| `icon-512-maskable.png` | Android adaptive icon |

All six go in the **top level** of the repo. No subfolders.

---

## Before you start

Read this bit, because it saves an hour of confusion later.

**Do not just double-click `index.html`.** Chrome refuses to store data on a `file://` page, so your tasks would vanish on every reload. The app will warn you if this happens. It has to be served over `https://`, which is exactly what the steps below do, and it is free.

**Your data lives on the device you use.** Nothing is uploaded anywhere. The planner on your phone and the planner on your laptop are two separate copies. Use **Export** and **Import** in the menu to move a snapshot between them.

---

## Step 1. Make a GitHub account

Skip if you have one.

1. Go to **github.com** and click **Sign up**.
2. Use an email you will keep. Set a password yourself, in your own browser.
3. Confirm the email GitHub sends you.

## Step 2. Make the repo

1. Click the **+** at the top right, then **New repository**.
2. **Repository name:** `headspace`
3. **Public.** This matters. GitHub Pages will not publish a private repo on the free plan.
4. Leave every other box alone. Click **Create repository**.

## Step 3. Upload the six files

1. On the new empty repo page, click **uploading an existing file** (or **Add file → Upload files**).
2. Unzip `headspace-site.zip` on your computer first, then drag **all six files** into the box at once.
3. Check the list shows six files, none of them inside a folder.
4. Scroll down and click **Commit changes**.

## Step 4. Turn on GitHub Pages

1. In the repo, click **Settings** (top right of the repo bar, not your account settings).
2. In the left sidebar, click **Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Set the branch to **main** and the folder to **/ (root)**.
5. Click **Save**.

Wait about two minutes. Refresh the Pages screen and a green banner appears with your address:

```
https://YOURNAME.github.io/headspace/
```

That link is the app. Open it on your laptop to check it loads.

## Step 5. Install it on your phone

Open that same link on your phone, then:

**iPhone (must be Safari, not Chrome)**
1. Tap the **Share** button, the square with the arrow.
2. Scroll down and tap **Add to Home Screen**.
3. Tap **Add**.

**Android (Chrome)**
1. Tap the **⋮** menu at the top right.
2. Tap **Install app** (sometimes **Add to Home screen**).
3. Tap **Install**.

You now have a Headspace icon. Open it from there, not from the browser, and it runs full screen.

## Step 6. Set it up on your laptop too

Just bookmark the same link. On Chrome you can also click the **install icon** in the address bar to get it as its own window.

---

## Updating it later

Whenever you upload a changed `index.html`:

1. Open `sw.js` and change `headspace-v1` to `headspace-v2`, then `v3` next time, and so on.
2. Upload both files.
3. Close the app fully on your phone and reopen it.

Skip the version bump and your phone will keep serving the old copy from its cache. This is the single most common reason an update seems not to have worked.

---

## Moving your tasks between devices

1. On the device that has your data, open the menu and tap **Export**. A `.json` file downloads.
2. Get that file onto the other device, by email, AirDrop, Drive, whatever is easiest.
3. On the other device, open the menu, tap **Import**, and pick the file.

Import replaces everything on that device, so export from the other one first if you have tasks on both.

---

## If something does not work

| What you see | What to do |
|---|---|
| **404, there isn't a GitHub Pages site here** | Give it another two minutes. Then check the repo is **Public** and that Pages is set to **main** / **/ (root)** |
| **Blank page** | `index.html` ended up inside a folder. All six files must sit at the top level of the repo |
| **No "Add to Home Screen" option** | On iPhone you must be in **Safari**. On Android check the address starts with `https://` |
| **Icon did not show up** | One of the three `.png` files was not uploaded, or was renamed. The names must match `manifest.webmanifest` exactly |
| **Old version keeps loading** | You skipped the `sw.js` version bump. Bump it, re-upload, then fully close and reopen the app |
| **Badge says "not saving"** | You are opening the file directly instead of through the `https://` address. Use the GitHub Pages link |
| **Tasks disappeared** | Check you are on the same device and the same browser. Data does not sync between them by design. Use Export and Import |

---

## How the planner itself works

There is a **Help** button in the menu that covers all of this, but in short:

- **Days, not hours.** Each day has **Must**, **Should**, and **Extra**. Extra stays locked until every Must is ticked. Free time is earned, not scheduled.
- **Paste a whole list** into the top box and every line becomes its own task.
- **Free Floating** holds anything with no date yet, in tabs you name.
- **Carry-over.** Unfinished tasks from past days land in a tray for a morning triage. Nothing disappears quietly.
- **Tap a task** to reprioritise, bump it, pick a date, file it, or add subtasks. On a laptop you can drag cards instead.
- **Focus** holds the mindset you set for the week.
