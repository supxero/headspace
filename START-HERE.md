# Start here: get Headspace live and connected to Claude Code

You don't need to know GitHub or the terminal. Follow this in order. Steps marked **(you)** are the few things you must do yourself: making accounts, typing passwords, approving logins.

Plain-language map of the tools:
- **GitHub** = online storage for your files + a free web host ("Pages") that gives your app a public link.
- **Git** = the tool on your computer that sends changes up to GitHub.
- **Node.js** = installs `npm`, which installs Claude Code.
- **Claude Code** = Claude running in your terminal, able to edit these files and publish them for you.

Important to know up front:
- Each device stores its own tasks. The link is the same app everywhere, not a shared list. Move data with Export/Import inside the app (menu).
- Don't just double-click `index.html`. Browsers refuse to save data on a `file://` page. It must be served over `https://`, which Pages does.

---

## PART A — Install the three tools (one time)

### A1. Node.js  **(you)**
1. Go to nodejs.org and download the **LTS** version for your system.
2. Run the installer, click through with defaults, keep "Add to PATH" checked.
3. **Close your terminal completely and open a new one** (it only reads PATH on startup).
4. Check it worked:
   ```
   node --version
   npm --version
   ```
   Both should print a version number.

### A2. Git  **(you)**
- Windows: download from git-scm.com, run the installer, accept all defaults.
- Mac: type `git --version`; if missing, it offers to install the tools. Or get it from git-scm.com.
- Check:
  ```
  git --version
  ```

### A3. GitHub CLI (`gh`)  **(you)**
This lets your computer talk to GitHub without fiddling with tokens.
- Windows: download from cli.github.com, run the installer.
- Mac: from cli.github.com, or `brew install gh` if you have Homebrew.
- Check:
  ```
  gh --version
  ```

---

## PART B — Put the project on your computer

### B1. Unzip
Unzip `headspace-starter.zip` somewhere easy, e.g. your Documents. You'll get this folder with `index.html`, the icons, `sw.js`, a `tests` folder, and these guides.

### B2. Open a terminal IN that folder
- Windows: open the folder in File Explorer, click the address bar, type `powershell`, press Enter.
- Mac: right-click the folder in Finder → Services → "New Terminal at Folder" (or `cd` into it).

Confirm you're in the right place:
```
ls        (Mac)      or      dir       (Windows)
```
You should see `index.html` listed.

---

## PART C — Sign in to GitHub and create the repo

### C1. Log in to GitHub from your computer  **(you)**
```
gh auth login
```
Answer the prompts: choose **GitHub.com**, protocol **HTTPS**, and **"Login with a web browser."** It shows a code, opens your browser, you paste the code and approve. Sign in with the account you want to own this project (this is the account that matters, not which Gmail you use elsewhere).

If you don't have a GitHub account yet, make one first at github.com, then run the command above.

### C2. Turn the folder into a repo and push it
Run these lines one at a time. Replace `YOURNAME` nowhere here; `gh` fills that in.
```
git init
git add -A
git commit -m "Initial Headspace app"
gh repo create headspace --public --source=. --remote=origin --push
```
That last line creates a **public** repo called `headspace` on your account and uploads everything. (Public is required for free Pages hosting.)

---

## PART D — Turn on the live website (GitHub Pages)  **(you, in the browser)**

1. Go to `https://github.com/YOURNAME/headspace` (your GitHub username in place of YOURNAME).
2. Click **Settings** (top of the repo), then **Pages** in the left sidebar.
3. Under **Source**, choose **Deploy from a branch**.
4. Set branch to **main**, folder to **/ (root)**, click **Save**.
5. Wait ~2 minutes, refresh. A green banner shows your link:
   ```
   https://YOURNAME.github.io/headspace/
   ```

Open that link on your computer to confirm it loads.

---

## PART E — Install it on your devices

- **Laptop:** bookmark the link. In Chrome you can also click the install icon in the address bar to get it as its own window.
- **iPhone:** open the link in **Safari** → Share → **Add to Home Screen** → Add.
- **Android:** open the link in Chrome → menu (⋮) → **Install app**.

You now get a real app icon that opens full screen. To move tasks between devices, use **Export** on one and **Import** on the other (in the app menu).

---

## PART F — Connect Claude Code (so future changes are one sentence)

### F1. Install Claude Code  **(you for the login)**
```
npm install -g @anthropic-ai/claude-code
```
Then, from inside the project folder:
```
claude
```
It walks you through signing in to your Anthropic account the first time.

### F2. Work from your terminal
Claude Code reads `CLAUDE.md` automatically, so it already knows the rules (single file, keep layout/behaviour, no white, bump the cache version, run tests). Now you can just say things like:

> "Make the Today button a bit larger, run the tests, then commit and push."

It edits `index.html`, runs the tests, bumps `sw.js`, commits, and pushes. Pages redeploys in a minute or two. On your phone, fully close and reopen the app to pick up the change.

What Claude Code will hand back to you (by design, it won't do these): creating accounts, typing passwords, and approving the `gh`/Anthropic browser logins. Everything else it can run for you.

---

## If something snags
- `npm not recognized` after installing Node: you didn't open a fresh terminal, or restart the PC.
- Pages shows 404: wait another two minutes; confirm the repo is **Public** and Pages is set to **main / (root)**.
- Blank page: make sure the six app files sit at the top level of the repo, not inside a subfolder.
- No "Add to Home Screen" on iPhone: you must be in Safari.
- Phone keeps showing the old version after an update: the `sw.js` cache version wasn't bumped. Bump it, push, then fully close and reopen the app.

`SETUP.md` in this folder repeats the hosting/install part if you want it standalone.
