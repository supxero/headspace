/* Viewport verification pass: real headless Chrome, real mouse and touch dispatch.
   Drives the full app through its flows at four device profiles and measures, per
   profile: horizontal page overflow, elementFromPoint at every control's centre,
   touch-target size on coarse-pointer profiles, blank control labels, and any
   computed colour that is pure white.

   Run from the project root:  node tests/viewports.js
   Needs Chrome installed (or CHROME_PATH set) and tests/node_modules (npm install).

   The four profiles. The layout branches at window.innerWidth<900 and the custom
   picker layer gates on (hover:hover), so the two tablet rows are the interesting
   ones: 1024 gets the wide desktop layout with a coarse pointer and no hover. */
const PROFILES = [
  { name: 'desktop-1280', width: 1280, height: 800,  coarse: false },
  { name: 'tablet-1024',  width: 1024, height: 768,  coarse: true  },
  { name: 'tablet-820',   width: 820,  height: 1180, coarse: true  },
  { name: 'phone-390',    width: 390,  height: 844,  coarse: true  },
];

const MIN_TARGET = 44;   /* smallest acceptable hit target on a coarse profile, px */

const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require(path.join(__dirname, 'node_modules', 'puppeteer-core'));

const ROOT = path.resolve(__dirname, '..');

/* ---------- dates, same +12h convention the app uses ---------- */
const iso = d => { const t = new Date(d); t.setHours(12, 0, 0, 0); return t.toISOString().slice(0, 10); };
const today = iso(new Date());
const plus = (n, from) => { const d = new Date((from || today) + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const yday = plus(-1);
const hweek = d => { const x = new Date((d || today) + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };

/* ---------- seed: rich enough that every flow has something to chew on ---------- */
function seedState() {
  const T = (id, title, subtasks) => ({ id, title, done: false, subtasks: subtasks || [], up: 1 });
  return {
    ver: 2, carry: [], tomb: {}, bin: {},
    days: {
      [yday]: { must: [T('c1', 'Email the landlord'), T('c2', 'Renew the parking permit'),
                       T('c3', 'Book the dentist'), T('c4', 'Pay the water bill')], should: [], extra: [] },
      [today]: { must: [T('ta', 'Write the report', [
                          { id: 's1', title: 'Draft the outline', done: false },
                          { id: 's2', title: 'Send it', done: false }]),
                        T('tb', 'Clear the inbox')],
                 should: [T('tc', 'Tidy the desk')], extra: [] },
    },
    focus: [{ id: 'foc1', title: 'Ship the viewport pass', done: false }],
    floats: [{ id: 'fInbox', name: 'Inbox', tasks: [T('fa', 'Sort the receipts')] },
             { id: 'fIdeas', name: 'Ideas', tasks: [] }],
    habits: { list: [{ id: 'h1', name: 'Stretch', days: [1, 2, 3, 4, 5, 6], up: 1 },
                     { id: 'h2', name: 'Read', days: [1, 3, 5], up: 1 }],
              marks: { [hweek(plus(-7))]: { h1: { 1: Date.now() - 7 * 864e5 } } } },
    week: { list: [{ id: 'w1', title: 'Water the plants', done: false, up: 1 },
                   { id: 'w2', title: 'File taxes', done: false, up: 1 }], hist: {} },
    settings: { view: 'board', boardOffset: 0, floatMode: false, activeFloat: null,
      calSel: null, calOffset: 0, mRange: 'day', stripDay: null, lastRoll: yday,
      showDone: false, habitsOpen: true, lastWeek: hweek(today) },
  };
}

/* ---------- in-page bootstrap: seed storage, stub the SW, install the auditor ----------
   Runs at document start on every navigation. The service worker is stubbed so a
   cache-first copy of an older index.html can never poison a later measuring run. */
function bootstrap(seedJson) {
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({});
  } catch (e) {}
  try {
    if (!localStorage.getItem('__vp_seeded')) {
      localStorage.setItem('agora_dayplanner_v1', seedJson);
      localStorage.setItem('__vp_seeded', '1');
    }
  } catch (e) {}

  /* the auditor. opts: {root, coarse, noScroll, keepToast, minTarget} */
  window.__audit = function (name, opts) {
    opts = opts || {};
    const out = { name, overflow: null, hitMisses: [], small: [], blank: [], white: [], counted: 0 };
    if (!opts.keepToast) { const t = document.getElementById('toast'); if (t) t.innerHTML = ''; }

    const de = document.scrollingElement || document.documentElement;
    out.overflow = { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth,
                     over: de.scrollWidth > window.innerWidth };

    const desc = el => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
      const a = el.dataset && el.dataset.action; if (a) s += '[' + a + ']';
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
      if (t) s += ' "' + t + '"';
      return s;
    };

    const root = opts.root ? document.querySelector(opts.root) : document;
    if (!root) { out.error = 'root not found: ' + opts.root; return out; }
    const CTRL = 'button,input,select,textarea,a[href],[data-action],[contenteditable="true"]';
    const all = [...root.querySelectorAll(CTRL)].filter(el => {
      if (el.id === 'fileIn') return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    /* containers (the modal scrim, anything wrapping other controls) are activation
       surfaces, not targets: their centre is legitimately covered by their children */
    const isContainer = el => all.some(x => x !== el && el.contains(x));

    /* effective hit size: the rect, widened by an absolutely positioned ::before
       with negative offsets, the coarse-pointer hit-area idiom */
    const effSize = (el, r) => {
      const ps = getComputedStyle(el, '::before');
      if (ps.content === 'none' || ps.position !== 'absolute') return { w: r.width, h: r.height };
      const t = parseFloat(ps.top) || 0, b = parseFloat(ps.bottom) || 0,
            l = parseFloat(ps.left) || 0, rr = parseFloat(ps.right) || 0;
      return { w: r.width - (l + rr), h: r.height - (t + b) };
    };

    const labelOf = el => {
      const aria = (el.getAttribute('aria-label') || '').trim(); if (aria) return aria;
      if (el.getAttribute('aria-labelledby')) return 'labelledby';
      const title = (el.title || '').trim(); if (title) return title;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const ph = (el.placeholder || '').trim(); if (ph) return ph;
        if (el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) return l.textContent.trim(); }
        return '';
      }
      if (el.tagName === 'SELECT')
        return el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
      return (el.textContent || '').trim();
    };

    const smallMap = {};
    for (const el of all) {
      if (isContainer(el)) continue;
      out.counted++;
      /* always scroll: an element can sit inside the viewport bounds yet be clipped
         away inside an overflow container (the modal body, the habits grid, a column
         body), and scrollIntoView is what a user's scroll would do before tapping */
      if (!opts.noScroll) el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const canHit = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
      if (canHit) {
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || (hit !== el && !el.contains(hit)))
          out.hitMisses.push({ el: desc(el), hit: hit ? desc(hit) : 'null',
                               at: Math.round(cx) + ',' + Math.round(cy) });
      }
      if (opts.coarse) {
        const eff = effSize(el, r);
        const m = Math.min(eff.w, eff.h);
        /* half a pixel of tolerance: fractional layout rounds 44px to 43.98 */
        if (m < (opts.minTarget || 44) - 0.5) {
          const key = desc(el).replace(/ ".*"$/, '') + ' ' +
            Math.round(r.width) + 'x' + Math.round(r.height) +
            (eff.w !== r.width || eff.h !== r.height
              ? ' (hit ' + Math.round(eff.w) + 'x' + Math.round(eff.h) + ')' : '');
          smallMap[key] = (smallMap[key] || 0) + 1;
        }
      }
      if (!labelOf(el)) out.blank.push(desc(el));
    }
    out.small = Object.entries(smallMap).map(([k, n]) => k + (n > 1 ? ' x' + n : ''));

    /* pure white sweep over everything rendered */
    const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
      'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke',
      'textDecorationColor', 'caretColor', 'accentColor'];
    const whiteMap = {};
    for (const el of document.querySelectorAll('*')) {
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      for (const p of PROPS) {
        const v = cs[p];
        if (v === 'rgb(255, 255, 255)' || (v && v.startsWith('rgba(255, 255, 255') && !v.endsWith(', 0)')))
          whiteMap[desc(el) + ' ' + p + '=' + v] = 1;
      }
      for (const p of ['backgroundImage', 'boxShadow']) {
        const v = cs[p];
        if (v && v !== 'none' && (v.includes('rgb(255, 255, 255') || v.includes('rgba(255, 255, 255')))
          whiteMap[desc(el) + ' ' + p + ' contains white'] = 1;
      }
    }
    out.white = Object.keys(whiteMap);

    window.scrollTo(0, 0);
    return out;
  };
}

/* ---------- tiny static server ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      fs.readFile(p.endsWith(path.sep) || p === ROOT ? path.join(ROOT, 'index.html') : p, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function findChrome() {
  const cands = [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  throw new Error('Chrome not found; set CHROME_PATH');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- one profile ---------- */
async function runProfile(browser, base, prof) {
  const coarse = prof.coarse, narrow = prof.width < 900;
  const R = { profile: prof, media: null, audits: [], checks: [], flowErrors: [] };
  const check = (name, cond, detail) =>
    R.checks.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });

  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: prof.width, height: prof.height, hasTouch: coarse, isMobile: coarse });
  await page.evaluateOnNewDocument(bootstrap, JSON.stringify(seedState()));
  page.on('pageerror', e => R.flowErrors.push('pageerror: ' + e.message));

  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#board .col');

  R.media = await page.evaluate(() => ({
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    hoverHover: matchMedia('(hover: hover)').matches,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  check('media: hover matches profile', R.media.hoverHover === !coarse, JSON.stringify(R.media));
  check('media: pointer matches profile', R.media.pointerCoarse === coarse);

  /* input helpers: touch dispatch on coarse profiles, mouse on the fine one */
  const center = spec => page.evaluate(s => {
    const list = [...document.querySelectorAll(s.css)];
    const el = s.text ? list.find(e => (e.textContent || '').trim().includes(s.text)) : list[s.nth || 0];
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, typeof spec === 'string' ? { css: spec } : spec);
  const act = async spec => {
    const css = typeof spec === 'string' ? spec : spec.css;
    /* a 5s toast is transient by design but overlays the bottom strip; dismiss it
       the way its own timer would, unless the toast is what we are tapping */
    if (!css.startsWith('#toast'))
      await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.innerHTML = ''; });
    const c = await center(spec);
    if (!c) throw new Error('control not found: ' + JSON.stringify(spec));
    if (coarse) await page.touchscreen.tap(c.x, c.y);
    else await page.mouse.click(c.x, c.y);
    await sleep(280);
  };
  const typeInto = async (spec, text) => { await act(spec); await page.keyboard.type(text); };
  const A = fn => page.evaluate(fn);
  const audit = async (name, opts) => {
    await sleep(380);
    const r = await page.evaluate((n, o) => window.__audit(n, o), name,
      Object.assign({ coarse, minTarget: MIN_TARGET }, opts || {}));
    R.audits.push(r);
    return r;
  };
  const flow = async (name, fn) => {
    try { await fn(); }
    catch (e) {
      R.flowErrors.push(name + ': ' + e.message);
      try {
        await page.screenshot({ path: path.join(__dirname, 'viewport-fail-' + prof.name + '-' + name.replace(/\W+/g, '-') + '.png') });
      } catch (e2) {}
    }
  };

  /* ---- A. boot: the seeded stale lastRoll must have rolled 4 tasks into the tray ---- */
  await flow('boot-tray', async () => {
    await page.waitForSelector('#tray .tray', { timeout: 5000 });
    const n = await A(() => window.A.state.carry.length);
    check('tray: 4 seeded carries after stale lastRoll', n === 4, 'carry.length=' + n);
    await audit('boot-tray');
  });

  /* ---- tray triage ---- */
  await flow('tray-triage', async () => {
    const mustBefore = await page.evaluate(t => window.A.state.days[t].must.length, today);
    await act({ css: '[data-action="carry-one"][data-to="today"]' });
    await act({ css: '[data-action="carry-one"][data-to="float"]' });
    await act({ css: '[data-action="carry-drop"]' });
    await audit('toast-undo', { root: '#toast', keepToast: true });
    await act({ css: '[data-action="carry-all"][data-to="today"]' });
    const s = await A(() => ({ carry: window.A.state.carry.length,
      inbox: window.A.state.floats.find(f => f.id === 'fInbox').tasks.length }));
    check('tray: emptied by triage', s.carry === 0, JSON.stringify(s));
    check('tray: carry-one landed in Inbox', s.inbox === 2, 'inbox=' + s.inbox);
    check('tray: today grew by one + all', mustBefore >= 2, 'must before=' + mustBefore);
  });

  /* ---- B. quick add, destination picker ---- */
  await flow('quick-add', async () => {
    if (!coarse) {
      await act('#qd');
      const open = await A(() => !!document.querySelector('#popRoot .popover'));
      check('qd: palette popover opens on fine pointer', open);
      if (open) {
        await audit('qd-popover', { root: '#popRoot .popover', noScroll: true });
        await act({ css: '#popRoot .popt', text: 'Today · Prio 1' });
      }
    } else {
      await act('#qd');
      const open = await A(() => !!document.querySelector('#popRoot .popover'));
      check('qd: no custom popover on coarse pointer', !open);
      await page.select('#qd', 'day:' + today + ':should');
    }
    const v = await page.$eval('#qd', el => el.value);
    check('qd: destination set to Today Prio 1', v === 'day:' + today + ':should', v);
    await typeInto('#qi', 'Quick added task');
    await act('#qb');
    const ok = await page.evaluate(t => {
      const d = window.A.state.days[t];
      return d && d.should.some(x => x.title === 'Quick added task');
    }, today);
    check('quick add: task in today Prio 1', ok);
  });

  /* ---- C. inline add ---- */
  await flow('inline-add', async () => {
    await act({ css: '[data-action="add-open"][data-k="day:' + today + ':must"]' });
    await audit('inline-add');
    await typeInto('.addin', 'Inline added task');
    await act({ css: '[data-action="add-commit"]' });
    const ok = await page.evaluate(t =>
      window.A.state.days[t].must.some(x => x.title === 'Inline added task'), today);
    check('inline add: committed', ok);
    await act({ css: '[data-action="add-open"][data-k="day:' + today + ':should"]' });
    await act({ css: '[data-action="add-cancel"]' });
    const closed = await A(() => !document.querySelector('.addin'));
    check('inline add: cancel closes the row', closed);
  });

  /* ---- D. the action bar, every control ---- */
  await flow('action-bar', async () => {
    /* select only if not already the open card: the sel action is a toggle */
    const sel = async id => {
      const open = await page.evaluate(i =>
        !!document.querySelector('.task.sel[data-id="' + i + '"]'), id);
      if (!open) await act({ css: '.ttl[data-action="sel"][data-id="' + id + '"]' });
    };
    await sel('ta');
    await page.waitForSelector('.task.sel .acts');
    await audit('action-bar');

    /* zone: to Prio 1 and back */
    await act({ css: '.task.sel [data-action="zone"][data-zone="should"]' });
    let z = await A(() => window.A.findTask('ta').from.zone);
    check('action bar: zone to should', z === 'should', z);
    await act({ css: '.task.sel [data-action="zone"][data-zone="must"]' });
    z = await A(() => window.A.findTask('ta').from.zone);
    check('action bar: zone back to must', z === 'must', z);

    /* reorder one step and back, in whichever direction the list allows */
    await sel('ta');
    const pos = await A(() => ({ i: window.A.findTask('ta').index }));
    const len = await page.evaluate(t => window.A.state.days[t].must.length, today);
    const dir = pos.i < len - 1 ? 1 : -1;
    await act({ css: '.task.sel [data-action="reorder"][data-d="' + dir + '"]' });
    const moved = await A(() => window.A.findTask('ta').index);
    check('action bar: reorder moves one step', moved === pos.i + dir, pos.i + '->' + moved + ' dir=' + dir);
    await sel('ta');
    await act({ css: '.task.sel [data-action="reorder"][data-d="' + (-dir) + '"]' });
    const back = await A(() => window.A.findTask('ta').index);
    check('action bar: reorder back', back === pos.i, pos.i + '->' + back);

    /* rename in place */
    await act({ css: '.task.sel [data-action="rename"]' });
    await page.keyboard.type('Write the quarterly report');
    await page.keyboard.press('Enter');
    await sleep(300);
    const title = await A(() => window.A.findTask('ta').task.title);
    check('action bar: rename committed', title === 'Write the quarterly report', title);

    /* steps: add, tick, rename, pop out, delete */
    await sel('ta');
    await typeInto('#sadd-ta', 'A third step');
    await act({ css: '[data-action="sadd"][data-id="ta"]' });
    let subs = await A(() => window.A.findTask('ta').task.subtasks.length);
    check('steps: added', subs === 3, 'subtasks=' + subs);
    await act({ css: '[data-action="stick"][data-id="ta"]' });
    const sdone = await A(() => window.A.findTask('ta').task.subtasks[0].done);
    check('steps: tick', sdone === true);
    await act({ css: '[data-action="srename"][data-id="ta"]', nth: 0 });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Draft the whole outline');
    await page.keyboard.press('Enter');
    await sleep(300);
    const st = await A(() => window.A.findTask('ta').task.subtasks[0].title);
    check('steps: rename committed', st === 'Draft the whole outline', st);
    await sel('ta');
    await act({ css: '[data-action="spop"][data-id="ta"]' });
    subs = await A(() => window.A.findTask('ta').task.subtasks.length);
    check('steps: popped out to its own task', subs === 2, 'subtasks=' + subs);
    await sel('ta');
    await act({ css: '[data-action="sdel"][data-id="ta"]' });
    subs = await A(() => window.A.findTask('ta').task.subtasks.length);
    check('steps: deleted', subs === 1, 'subtasks=' + subs);

    /* bump: to tomorrow, then back from tomorrow's column / strip day */
    await sel('ta');
    await act({ css: '.task.sel [data-action="bump"][data-d="1"]' });
    let loc = await A(() => window.A.findTask('ta').from.date);
    check('action bar: bump to tomorrow', loc === plus(1), loc);
    if (narrow) await act({ css: '#strip [data-action="strip"]', text: 'Tmrw' });
    await sel('ta');
    await act({ css: '.task.sel [data-action="bump"][data-d="-1"]' });
    loc = await A(() => window.A.findTask('ta').from.date);
    check('action bar: bump back to today', loc === today, loc);
    if (narrow) await act({ css: '#strip [data-action="strip"]', text: 'Today' });

    /* pickdate: fine pointer gets the popover, coarse keeps the native input alive */
    await sel('tb');
    if (!coarse) {
      await act({ css: '.task.sel input[data-action="pickdate"]' });
      const open = await A(() => !!document.querySelector('#popRoot .popover'));
      check('pickdate: date popover opens on fine pointer', open);
      if (open) {
        await audit('date-popover', { root: '#popRoot .popover', noScroll: true });
        const inView = await page.evaluate(d =>
          !!document.querySelector('#popRoot [data-pday="' + d + '"]'), yday);
        if (!inView) await act({ css: '#popRoot [data-pnav="-1"]' });
        await act({ css: '#popRoot [data-pday="' + yday + '"]' });
      }
    } else {
      await act({ css: '.task.sel input[data-action="pickdate"]' });
      const alive = await A(() => ({
        input: !!document.querySelector('.task.sel input[data-action="pickdate"]'),
        pop: !!document.querySelector('#popRoot .popover') }));
      check('pickdate: input survives the tap (the B fix)', alive.input, JSON.stringify(alive));
      check('pickdate: no custom popover on coarse pointer', !alive.pop);
      await page.evaluate(v => {
        const i = document.querySelector('.task.sel input[data-action="pickdate"]');
        i.value = v; i.dispatchEvent(new Event('change', { bubbles: true }));
      }, yday);
      await sleep(300);
    }
    const tbAt = await A(() => window.A.findTask('tb').from.date);
    check('pickdate: task moved to yesterday', tbAt === yday, tbAt);

    /* tofloat: the native select, everywhere */
    await sel('tc');
    await page.select('.task.sel select[data-action="tofloat"]', 'fInbox');
    await sleep(300);
    const tcAt = await A(() => window.A.findTask('tc').from);
    check('tofloat: filed to Inbox', tcAt.kind === 'float' && tcAt.fid === 'fInbox', JSON.stringify(tcAt));

    /* tick, then delete the quick-added task into the bin */
    const qid = await page.evaluate(t => window.A.state.days[t].should.find(x => x.title === 'Quick added task').id, today);
    await act({ css: '[data-action="tick"][data-id="' + qid + '"]' });
    let qdone = await page.evaluate(id => window.A.findTask(id).task.done, qid);
    check('tick: toggles done', qdone === true);
    await act({ css: '[data-action="tick"][data-id="' + qid + '"]' });
    await act({ css: '.ttl[data-action="sel"][data-id="' + qid + '"]' });
    await act({ css: '.task.sel [data-action="del"]' });
    const gone = await page.evaluate(id => !window.A.findTask(id), qid);
    check('del: task removed with undo toast', gone);
  });

  /* ---- E. board nav, day strip, roll-now ---- */
  await flow('board-nav', async () => {
    await act({ css: '[data-action="nav"][data-d="-7"]' });
    let off = await A(() => window.A.state.settings.boardOffset);
    check('nav: prev shifts a week', off === -7, off);
    await act({ css: '[data-action="nav-today"]' });
    off = await A(() => window.A.state.settings.boardOffset);
    check('nav: today resets', off === 0, off);
    await act({ css: '[data-action="nav"][data-d="7"]' });
    await act({ css: '[data-action="nav-today"]' });

    const stripThere = await A(() => document.querySelectorAll('#strip button').length);
    if (narrow) {
      check('strip: day strip present under 900px', stripThere > 0, stripThere + ' buttons');
      await act({ css: '#strip [data-action="strip"]', text: 'Ystdy' });
      let sd = await A(() => window.A.state.settings.stripDay);
      check('strip: yesterday selected', sd === yday, sd);
      await act({ css: '#strip [data-action="strip"]', text: 'Today' });
      sd = await A(() => window.A.state.settings.stripDay);
      check('strip: back to today', sd === today, sd);
    } else {
      check('strip: absent on the wide layout', stripThere === 0, stripThere + ' buttons');
    }

    /* jumpDate */
    if (!coarse) {
      await act('#jumpDate');
      const open = await A(() => !!document.querySelector('#popRoot .popover'));
      check('jumpDate: popover opens on fine pointer', open);
      if (open) await act({ css: '#popRoot [data-pact="today"]' });
    } else {
      await act('#jumpDate');
      const pop = await A(() => !!document.querySelector('#popRoot .popover'));
      check('jumpDate: native path on coarse pointer', !pop);
      await page.evaluate(v => {
        const i = document.querySelector('#jumpDate');
        i.value = v; i.dispatchEvent(new Event('change', { bubbles: true }));
      }, plus(3));
      await sleep(300);
      const off3 = await A(() => window.A.state.settings.boardOffset);
      check('jumpDate: board jumped +3', off3 === 3, off3);
      await act({ css: '[data-action="nav-today"]' });
    }

    /* roll-now: tb sits open on yesterday, so the affordance must be up */
    const btn = await A(() => { const b = document.querySelector('[data-action="roll-now"]');
      return b ? b.textContent.trim() : null; });
    check('roll-now: affordance shows for the back-dated task', !!btn, btn);
    if (btn) {
      await act({ css: '[data-action="roll-now"]' });
      const carried = await A(() => window.A.state.carry.length);
      check('roll-now: task moved to the tray', carried === 1, 'carry=' + carried);
      await act({ css: '[data-action="carry-one"][data-to="today"]' });
    }
  });

  /* ---- F. Free Floating ---- */
  await flow('free-floating', async () => {
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    const mode = await A(() => window.A.state.settings.floatMode);
    check('float: mode on', mode === true);
    await audit('float-board');

    /* tab drag reorder: real DragEvents with a real DataTransfer, dispatched in-page,
       because Chrome raises no drag events from synthetic mouse moves and none at all
       from touch. This drives the exact production handlers at real layout, so the
       before/after midpoint math runs against true rectangles. Along the way: the
       grabbed state, the landing-side bar in palette denim, the zero-cost repeat
       dragover, the FLIP on the swap, and a clean slate after the drop. */
    const beforeOrder = await A(() => window.A.state.floats.map(f => f.id).join());
    const drag = await A(() => {
      const head = document.querySelector('.col.backlog[data-fid="fIdeas"] .colhead');
      const target = document.querySelector('.col.backlog[data-fid="fInbox"]');
      if (!head || !target) return { err: 'missing' };
      const dt = new DataTransfer();
      const ev = (type, el, at) => el.dispatchEvent(new DragEvent(type,
        Object.assign({ bubbles: true, cancelable: true, dataTransfer: dt }, at || {})));
      const r = target.getBoundingClientRect();
      const at = { clientX: r.left + 4, clientY: r.top + 4 };   /* the near half: land in front */
      const out = {};
      ev('dragstart', head);
      out.grabbed = head.closest('.col.backlog').classList.contains('dragging');
      ev('dragover', target, at);
      out.cue = target.classList.contains('drop');
      out.side = target.classList.contains('drop-before') && !target.classList.contains('drop-after');
      const ps = getComputedStyle(target, '::after');
      out.bar = ps.content !== 'none' ? ps.backgroundColor : 'no bar';
      /* the streaming cost: repeats of an unchanged dragover must write nothing */
      const tl = DOMTokenList.prototype, oa = tl.add, orm = tl.remove;
      let writes = 0;
      tl.add = function (...a) { writes++; return oa.apply(this, a); };
      tl.remove = function (...a) { writes++; return orm.apply(this, a); };
      for (let i = 0; i < 60; i++) ev('dragover', target, at);
      tl.add = oa; tl.remove = orm;
      out.stillWrites = writes;
      /* the swap must run as a FLIP: count element.animate calls around the drop */
      const oan = Element.prototype.animate;
      let flips = 0;
      Element.prototype.animate = function (...a) { flips++; return oan.apply(this, a); };
      ev('drop', target, at);
      Element.prototype.animate = oan;
      out.flips = flips;
      document.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
      out.after = window.A.state.floats.map(f => f.id).join();
      out.cleared = !document.querySelector('.drop,.drop-before,.drop-after,.dragging');
      return out;
    });
    check('tabs: drag moves Ideas in front of Inbox', drag.after === 'fIdeas,fInbox',
      beforeOrder + ' -> ' + drag.after);
    check('tabs: the grabbed column reads as grabbed', drag.grabbed === true, JSON.stringify(drag));
    check('tabs: the target shows the cue and the landing side', drag.cue === true && drag.side === true);
    check('tabs: the insertion bar paints in palette denim', drag.bar === 'rgb(95, 134, 166)', drag.bar);
    check('tabs: sixty unchanged dragovers write nothing', drag.stillWrites === 0, 'writes=' + drag.stillWrites);
    check('tabs: the swap animates as a FLIP, both columns moving', drag.flips === 2, 'flips=' + drag.flips);
    check('tabs: every drag cue is gone after the drop', drag.cleared === true);
    const drawn = await A(() => [...document.querySelectorAll('.col.backlog')].map(c => c.dataset.fid).join());
    check('tabs: the board redraws in the new order', drawn === 'fIdeas,fInbox', drawn);
    await A(() => window.A.save());
    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('agora_dayplanner_v1')).floats.map(f => f.id).join());
    check('tabs: the new order is what persists', persisted === 'fIdeas,fInbox', persisted);
    await A(() => { window.A.reorderTab('fInbox', 'fIdeas', false); window.A.save(); window.A.render(); });

    /* on the coarse profiles a real touch drag across the header must stay inert:
       no mobile browser raises HTML5 drag events from touch (risk 12), and the
       polish must not have grown a touch path of its own */
    if (coarse) {
      const c1 = await center({ css: '.col.backlog .colhead', nth: 0 });
      await page.touchscreen.touchStart(c1.x, c1.y);
      for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(c1.x + i * 25, c1.y + i * 6);
      await page.touchscreen.touchEnd();
      await sleep(300);
      const t = await A(() => ({ order: window.A.state.floats.map(f => f.id).join(),
        drag: !!window.A.ui.drag,
        cues: !!document.querySelector('.drop,.drop-before,.drop-after,.dragging') }));
      check('tabs: a touch drag still does not start', !t.drag && !t.cues, JSON.stringify(t));
      check('tabs: and the order is untouched by it', t.order === 'fInbox,fIdeas', t.order);
    }

    /* + Tab spawns a tab and opens its rename in place */
    await act({ css: '[data-action="float-new"]' });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Errands');
    await page.keyboard.press('Enter');
    await sleep(300);
    let names = await A(() => window.A.state.floats.map(f => f.name));
    check('float: new tab renamed to Errands', names.includes('Errands'), names.join(','));

    /* inline add inside the new tab */
    const eid = await A(() => window.A.state.floats.find(f => f.name === 'Errands').id);
    await act({ css: '[data-action="add-open"][data-k="float:' + eid + '"]' });
    await typeInto('.addin', 'Buy stamps');
    await act({ css: '[data-action="add-commit"]' });
    const n = await page.evaluate(id => window.A.state.floats.find(f => f.id === id).tasks.length, eid);
    check('float: task added in tab', n === 1, 'tasks=' + n);

    /* rename an existing tab and back */
    await act({ css: '[data-action="float-rename"][data-fid="fIdeas"]' });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Ideas 2');
    await page.keyboard.press('Enter');
    await sleep(300);
    names = await A(() => window.A.state.floats.map(f => f.name));
    check('float: tab renamed', names.includes('Ideas 2'), names.join(','));

    /* delete the full tab: modal, then move-and-delete */
    await act({ css: '[data-action="float-del"][data-fid="' + eid + '"]' });
    const modal = await A(() => !!document.querySelector('#modalRoot .modal'));
    check('float: delete of a full tab asks first', modal);
    if (modal) {
      await audit('tab-del-modal', { root: '#modalRoot .modal' });
      await act({ css: '[data-action="float-del-move"]' });
    }
    names = await A(() => window.A.state.floats.map(f => f.name));
    check('float: full tab deleted, tasks moved', !names.includes('Errands'), names.join(','));
    const moved = await A(() => window.A.state.floats[0].tasks.some(t => t.title === 'Buy stamps'));
    check('float: its task landed in the first tab', moved);

    /* delete the empty tab directly */
    await act({ css: '[data-action="float-del"][data-fid="fIdeas"]' });
    names = await A(() => window.A.state.floats.map(f => f.name));
    check('float: empty tab deleted without asking', !names.includes('Ideas 2'), names.join(','));
    const delBtnGone = await A(() => !document.querySelector('[data-action="float-del"]'));
    check('float: last tab offers no delete', delBtnGone);

    await act({ css: '#boardnav [data-action="floattoggle"]' });
    const back = await A(() => window.A.state.settings.floatMode);
    check('float: back to dates', back === false);
  });

  /* ---- G. calendar ---- */
  await flow('calendar', async () => {
    await act({ css: '.navbtn[data-action="view"][data-v="calendar"]' });
    await page.waitForSelector('.calgrid');
    await act({ css: '[data-action="cal-nav"][data-d="1"]' });
    let o = await A(() => window.A.state.settings.calOffset);
    check('cal: next month', o === 1, o);
    await act({ css: '[data-action="cal-nav"][data-d="-1"]' });
    await act({ css: '[data-action="cal-nav"][data-d="0"]' });
    o = await A(() => window.A.state.settings.calOffset);
    check('cal: this month resets', o === 0, o);

    await act({ css: '.cell[data-action="cal-day"][data-day="' + today + '"]' });
    await page.waitForSelector('.dpanel');
    await audit('calendar-dpanel');
    await typeInto('#calAdd', 'Added from the calendar');
    await page.select('#calZone', 'should');
    await act({ css: '[data-action="cal-add"][data-day="' + today + '"]' });
    const ok = await page.evaluate(t =>
      window.A.state.days[t].should.some(x => x.title === 'Added from the calendar'), today);
    check('cal: add lands in the picked zone', ok);
    await act({ css: '.dpanel [data-action="goto-day"]' });
    const v = await A(() => window.A.state.settings.view);
    check('cal: goto-day returns to the board', v === 'board', v);
  });

  /* ---- H. habits ---- */
  await flow('habits', async () => {
    const host = narrow ? '#habits' : '#habitsRail';
    const there = await page.evaluate(h => !!document.querySelector(h + ' [data-action="habit-add"]'), host);
    check('habits: panel lives in ' + host, there);
    await audit('habits');

    await typeInto('#habitAdd', 'Meditate');
    await act({ css: '[data-action="habit-add"]' });
    let hn = await A(() => window.A.state.habits.list.length);
    check('habits: added', hn === 3, 'list=' + hn);

    /* tick today (Monday..Saturday only; on a Sunday tick Monday's cell) */
    const dow = new Date().getDay() || 1;
    await act({ css: '[data-action="habit-tick"][data-id="h1"][data-dow="' + dow + '"]' });
    let mark = await page.evaluate(d => { const wk = Object.keys(window.A.state.habits.marks).sort().slice(-1)[0];
      return ((window.A.state.habits.marks[wk] || {}).h1 || {})[d] || 0; }, dow);
    check('habits: tick positive', mark > 0, mark);
    await act({ css: '[data-action="habit-tick"][data-id="h1"][data-dow="' + dow + '"]' });
    mark = await page.evaluate(d => { const wk = Object.keys(window.A.state.habits.marks).sort().slice(-1)[0];
      return ((window.A.state.habits.marks[wk] || {}).h1 || {})[d] || 0; }, dow);
    check('habits: untick negative', mark < 0, mark);
    await act({ css: '[data-action="habit-tick"][data-id="h1"][data-dow="' + dow + '"]' });

    /* schedule: open the day editor, toggle Tuesday, close */
    await act({ css: '[data-action="habit-days"][data-id="h2"]' });
    await audit('habit-days-edit');
    await act({ css: '[data-action="habit-day"][data-id="h2"][data-dow="2"]' });
    await act({ css: '[data-action="habit-days-done"]' });
    const days = await A(() => window.A.state.habits.list.find(h => h.id === 'h2').days.join(','));
    check('habits: schedule edited', days === '1,2,3,5', days);

    /* rename, delete, collapse */
    await act({ css: '[data-action="habit-rename"][data-id="h2"]' });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Read fiction');
    await page.keyboard.press('Enter');
    await sleep(300);
    const nm = await A(() => window.A.state.habits.list.find(h => h.id === 'h2').name);
    check('habits: renamed', nm === 'Read fiction', nm);
    const mid = await A(() => window.A.state.habits.list.find(h => h.name === 'Meditate').id);
    await act({ css: '[data-action="habit-del"][data-id="' + mid + '"]' });
    hn = await A(() => window.A.state.habits.list.length);
    check('habits: deleted', hn === 2, 'list=' + hn);
    await act({ css: '[data-action="habit-toggle"]' });
    const closed = await A(() => window.A.state.settings.habitsOpen);
    check('habits: Hide collapses', closed === false);
    await act({ css: '[data-action="habit-toggle"]' });
  });

  /* ---- I. the weekly list ---- */
  await flow('weekly', async () => {
    await typeInto('#weekAdd', 'Call the bank');
    await act({ css: '[data-action="week-add"]' });
    let wn = await A(() => window.A.state.week.list.length);
    check('weekly: added', wn === 3, 'list=' + wn);
    await act({ css: '[data-action="week-tick"][data-id="w1"]' });
    const done = await A(() => window.A.state.week.list.find(t => t.id === 'w1').done);
    check('weekly: tick', done === true);
    await act({ css: '[data-action="week-rename"][data-id="w2"]' });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('File the taxes');
    await page.keyboard.press('Enter');
    await sleep(300);
    const wt = await A(() => window.A.state.week.list.find(t => t.id === 'w2').title);
    check('weekly: renamed', wt === 'File the taxes', wt);
    const cid = await A(() => window.A.state.week.list.find(t => t.title === 'Call the bank').id);
    await act({ css: '[data-action="week-del"][data-id="' + cid + '"]' });
    wn = await A(() => window.A.state.week.list.length);
    check('weekly: deleted', wn === 2, 'list=' + wn);
  });

  /* ---- I2. empty-collapse: an emptied panel folds to its header bar ---- */
  await flow('empty-collapse', async () => {
    const host = narrow ? '#weekMobile' : '#weekRail';
    const ids = await A(() => window.A.state.week.list.map(t => t.id));
    for (const id of ids) await act({ css: '[data-action="week-del"][data-id="' + id + '"]' });
    const c = await page.evaluate(h => {
      const n = document.querySelector(h);
      return { add: !!n.querySelector('#weekAdd'), chev: !!n.querySelector('.chev'),
               open: !!n.querySelector('.chev.open'),
               head: (n.querySelector('.kh') || { textContent: '' }).textContent };
    }, host);
    check('collapse: an emptied weekly panel is a header bar', !c.add && c.chev && !c.open, JSON.stringify(c));
    check('collapse: its count still reads 0 open', /0 open/.test(c.head), c.head);
    await audit('week-collapsed');
    await act({ css: host + ' .kh[data-action="panel-toggle"]' });
    const opened = await A(() => !!document.querySelector('#weekAdd'));
    check('collapse: tapping the header opens the panel', opened);
    await audit('week-peeked');
    await typeInto('#weekAdd', 'Refill the list');
    await act({ css: '[data-action="week-add"]' });
    const n = await A(() => window.A.state.week.list.length);
    check('collapse: adding through the opened panel works', n === 1, 'list=' + n);
  });

  /* ---- I2b. True north: a statement panel, pinned open while it holds one ---- */
  await flow('true-north', async () => {
    if (narrow) await act('#railtoggle');
    const p0 = await A(() => {
      const p = document.querySelector('#fpanel');
      return { name: /True north/.test(p.textContent), box: !!p.querySelector('.box'),
        tick: !!p.querySelector('[data-action="focus-tick"]'), chev: !!p.querySelector('.chev'),
        toggle: !!p.querySelector('.kh[data-action="panel-toggle"]'),
        open: /open/.test(p.querySelector('.kh').textContent),
        bg: getComputedStyle(p).backgroundColor };
    });
    check('north: header carries the new name', p0.name === true, JSON.stringify(p0));
    check('north: no tick box and no tick action', !p0.box && !p0.tick);
    check('north: holding a statement, no chevron and no toggle', !p0.chev && !p0.toggle);
    check('north: the header never says open', !p0.open);
    check('north: the panel sits on palette pearl', p0.bg === 'rgb(245, 244, 239)', p0.bg);
    await audit('true-north', { root: '#fpanel' });

    /* rename in place */
    await act({ css: '#fpanel .ftxt span[data-action="focus-rename"]' });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Steady, not rushed');
    await page.keyboard.press('Enter');
    await sleep(300);
    const t1 = await A(() => window.A.state.focus[0].title);
    check('north: rename in place commits', t1 === 'Steady, not rushed', t1);

    /* add a second statement through the always-present add row */
    await typeInto('#fi', 'Less but better');
    await act({ css: '[data-action="focus-add"]' });
    let n = await A(() => window.A.state.focus.length);
    check('north: second statement added', n === 2, 'focus=' + n);

    /* set one aside: date recorded, the archive appears without chore framing */
    const sid = await A(() => window.A.state.focus[1].id);
    await act({ css: '[data-action="focus-aside"][data-id="' + sid + '"]' });
    const aside = await A(() => ({ done: window.A.state.focus[1].done, at: window.A.state.focus[1].doneAt,
      label: /Set aside \(1\)/.test(document.querySelector('#fpanel').textContent),
      completed: /Completed/.test(document.querySelector('#fpanel').textContent) }));
    check('north: set aside stamps the held-until date', aside.done === true && !!aside.at, JSON.stringify(aside));
    check('north: the archive reads Set aside, never Completed', aside.label && !aside.completed);
    await act({ css: '[data-action="focus-toggle-done"]' });
    await audit('true-north-aside', { root: '#fpanel' });
    await act({ css: '[data-action="focus-back"][data-id="' + sid + '"]' });
    const back = await A(() => window.A.state.focus[1].done === false && window.A.state.focus[1].doneAt === null);
    check('north: bring back clears the aside marks', back === true);

    /* delete with the same 5s undo as everything else */
    await act({ css: '[data-action="focus-del"][data-id="' + sid + '"]' });
    n = await A(() => window.A.state.focus.length);
    check('north: delete removes the statement', n === 1, 'focus=' + n);
    const toastSays = await A(() => document.querySelector('#toast').textContent);
    check('north: the toast speaks statement language', /Statement removed/.test(toastSays),
      toastSays.trim().slice(0, 40));
    await act({ css: '#toast [data-action="undo"]' });
    n = await A(() => window.A.state.focus.length);
    check('north: undo brings it back', n === 2, 'focus=' + n);
    await A(() => { window.A.state.focus = window.A.state.focus.slice(0, 1); window.A.save(); window.A.render(); });

    /* the rename reached everything rendered */
    const stale = await A(() => document.documentElement.outerHTML.includes('Focus this week'));
    check('north: nothing rendered says Focus this week', stale === false);
    if (narrow) await act('#railtoggle');
  });

  /* ---- I3. notes ---- */
  let richNoteId = null;   /* set by the notes flow, restored by the bin flow */
  await flow('notes', async () => {
    await act({ css: '.navbtn[data-action="view"][data-v="notes"]' });
    const v = await A(() => window.A.state.settings.view);
    check('notes: view switches', v === 'notes', v);
    await audit('notes-empty');
    await act({ css: '[data-action="note-new"]' });
    await page.keyboard.type('Packing list');
    const titled = await A(() => window.A.state.notes[0] && window.A.state.notes[0].title);
    check('notes: title lands straight in the new note', titled === 'Packing list', titled);
    await act('#noteBody');
    await page.keyboard.type('socks and passport');
    const body = await A(() => window.A.state.notes[0].body);
    check('notes: the body saves as you type', body === 'socks and passport', body);
    await audit('notes-editor');
    await act({ css: '[data-action="note-new"]' });
    /* commit, so the change tracker has seen the second note before it is deleted;
       an item created and deleted inside one save debounce never reaches any store,
       so there is nothing for the bin to keep, and that is true of tasks too */
    await A(() => window.A.save());
    const sortTop = await A(() => ({
      top: ([...document.querySelectorAll('.noterow')][0] || {}).dataset.id,
      newer: (window.A.state.notes.find(n => !n.title) || {}).id }));
    check('notes: the list sorts the newest edit first', sortTop.top === sortTop.newer,
      JSON.stringify(sortTop));
    await act({ css: '.noterow', text: 'Packing list' });
    const selBody = await page.$eval('#noteBody', el => el.textContent);
    check('notes: picking a row swaps the editor', selBody === 'socks and passport', selBody);

    /* the quiet meta line: orientation, never chrome */
    const meta = await A(() => (document.getElementById('noteMeta') || {}).textContent || '');
    check('notes: the meta line reads edited-today and a count', /Edited today/.test(meta) && /word/.test(meta), meta);

    /* the layout: the page sits directly beside the list, one continuous surface;
       the text column declares the reading measure and the page ENDS with it, so
       title, toolbar and body share edges and no pearl runs on past the content */
    if (!narrow) {
      const m = await A(() => {
        const l = document.querySelector('.notelist').getBoundingClientRect();
        const p = document.querySelector('.notepage').getBoundingClientRect();
        const t = document.querySelector('.notewrap').getBoundingClientRect();
        const e = document.querySelector('.noteed').getBoundingClientRect();
        const ti = document.getElementById('noteTitle').getBoundingClientRect();
        const tb = document.getElementById('noteTools').getBoundingClientRect();
        const bd = document.getElementById('noteBody').getBoundingClientRect();
        return { gap: Math.round(p.left - l.right), tw: Math.round(t.width),
          pw: Math.round(p.width), spare: Math.round(e.right - p.right),
          edges: Math.abs(ti.left - tb.left) < 1.5 && Math.abs(ti.left - bd.left) < 1.5 &&
                 Math.abs(ti.right - tb.right) < 1.5 && Math.abs(ti.right - bd.right) < 1.5 };
      });
      check('notes: no dead gap between list and page', m.gap <= 30, 'gap=' + m.gap);
      check('notes: the text column keeps a bounded measure', m.tw <= 660, 'w=' + m.tw);
      check('notes: the page ends with its content, no stranded pearl', m.pw <= 710, 'pw=' + m.pw);
      check('notes: title, toolbar and body share the same edges', m.edges);
      check('notes: the page never overflows its pane', m.spare >= -1, 'spare=' + m.spare);
    }

    /* ---- formatting, driven through the real editing engine ---- */
    const selectWord = word => page.evaluate(wd => {
      const ed = document.getElementById('noteBody');
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = n.data.indexOf(wd);
        if (i > -1) {
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + wd.length);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          ed.focus(); return true;
        }
      }
      return false;
    }, word);
    const noteBody = () => A(() =>
      (window.A.state.notes.find(x => x.title === 'Packing list') || {}).body || '');

    check('notes: word found to format', await selectWord('socks'));
    await act({ css: '.ntb[data-cmd="bold"]' });
    check('notes: bold wraps the selection', /<b>socks<\/b>/.test(await noteBody()), await noteBody());
    check('notes: the body committed as the sanitized subset', /^<div/.test(await noteBody()));
    await selectWord('passport');
    await act({ css: '.ntb[data-cmd="italic"]' });
    check('notes: italic', /<i>passport<\/i>/.test(await noteBody()), await noteBody());
    await selectWord('and');
    await act({ css: '.ntb[data-cmd="underline"]' });
    check('notes: underline', /<u>and<\/u>/.test(await noteBody()));
    await selectWord('socks');
    await act({ css: '.ntb[data-cmd="strike"]' });
    check('notes: strikethrough', /<s>/.test(await noteBody()), await noteBody());
    /* the toolbar mirrors the caret */
    await selectWord('passport');
    await sleep(250);
    const tstate = await A(() => (document.querySelector('.ntb[data-cmd="italic"]') || {}).className || '');
    check('notes: the toolbar lights up under formatted text', /\bon\b/.test(tstate), tstate);
    /* highlight: a palette colour, measured as painted */
    await selectWord('passport');
    await act({ css: '.ntb[data-cmd="hl-powder"]' });
    check('notes: highlight stores its class', /class="hl-powder"/.test(await noteBody()), await noteBody());
    const hlbg = await A(() => { const s = document.querySelector('#noteBody .hl-powder');
      return s ? getComputedStyle(s).backgroundColor : 'missing'; });
    check('notes: highlight paints palette powder', hlbg === 'rgb(207, 227, 241)', hlbg);
    /* size: from the existing scale, measured as painted */
    await selectWord('and');
    await act({ css: '.ntb[data-cmd="size-l"]' });
    const fz = await A(() => { const s = document.querySelector('#noteBody .fz-l');
      return s ? getComputedStyle(s).fontSize : 'missing'; });
    check('notes: large text is the 19px scale step', fz === '19px', fz);
    /* the remaining commands: the other two highlights, the toggle-off, small, clear */
    await selectWord('socks');
    await act({ css: '.ntb[data-cmd="hl-ocean"]' });
    const oc = await A(() => { const s = document.querySelector('#noteBody .hl-ocean');
      return s ? getComputedStyle(s).backgroundColor : 'missing'; });
    check('notes: ocean highlight paints palette ocean', oc === 'rgb(143, 182, 216)', oc);
    await selectWord('socks');
    await act({ css: '.ntb[data-cmd="hl-ocean"]' });
    check('notes: the same highlight again removes it', !/hl-ocean/.test(await noteBody()), await noteBody());
    await selectWord('passport');
    await act({ css: '.ntb[data-cmd="hl-tile"]' });
    const tl = await A(() => { const s = document.querySelector('#noteBody .hl-tile');
      return s ? getComputedStyle(s).backgroundColor : 'missing'; });
    check('notes: tile highlight paints palette tile', tl === 'rgb(227, 238, 247)', tl);
    await selectWord('passport');
    await act({ css: '.ntb[data-cmd="size-s"]' });
    const fs2 = await A(() => { const s = document.querySelector('#noteBody .fz-s');
      return s ? getComputedStyle(s).fontSize : 'missing'; });
    check('notes: small text is the 13px scale step', fs2 === '13px', fs2);
    await selectWord('and');
    await act({ css: '.ntb[data-cmd="size-0"]' });
    check('notes: body size clears the large span', !/fz-l/.test(await noteBody()), await noteBody());
    /* lists: bullet, dash, numbered */
    await A(() => { const ed = document.getElementById('noteBody');
      ed.innerHTML = '<div>alpha</div><div>beta</div>';
      ed.dispatchEvent(new Event('input', { bubbles: true })); });
    check('notes: line found for lists', await selectWord('alpha'));
    await act({ css: '.ntb[data-cmd="ul"]' });
    check('notes: bulleted list', /<ul><li>/.test(await noteBody()), await noteBody());
    check('notes: caret still in the list', await selectWord('alpha'));
    await act({ css: '.ntb[data-cmd="dash"]' });
    check('notes: the second bullet style', /<ul class="dash">/.test(await noteBody()), await noteBody());
    const dashMark = await A(() => { const u = document.querySelector('#noteBody ul');
      return u ? getComputedStyle(u).listStyleType : 'missing'; });
    check('notes: dash bullets really draw a dash', /-/.test(dashMark), dashMark);
    check('notes: word for numbered', await selectWord('alpha'));
    await act({ css: '.ntb[data-cmd="ol"]' });
    check('notes: numbered list', /<ol><li>|<ol>/.test(await noteBody()), await noteBody());
    /* page appearance: state, paint, and legibility on all three */
    for (const pg of ['ruled', 'dot', 'plain']) {
      await page.select('#notePage', pg);
      await sleep(200);
      const st = await A(() => { const ed = document.getElementById('noteBody');
        const cs = getComputedStyle(ed);
        return { pg: (window.A.state.notes.find(x => x.title === 'Packing list') || {}).pg || 'plain',
                 bg: cs.backgroundImage !== 'none', ink: cs.color }; });
      check('notes: page ' + pg + ' lands in state', st.pg === pg, st.pg);
      check('notes: page ' + pg + ' paints ' + (pg === 'plain' ? 'nothing' : 'a background'),
        pg === 'plain' ? !st.bg : st.bg);
      check('notes: ink stays navy on ' + pg, st.ink === 'rgb(20, 41, 63)', st.ink);
    }
    await audit('notes-rich');
    /* the toolbar is the densest cluster of small controls in the app: on coarse
       profiles, measure every one of them and report the actual minimum */
    if (coarse) {
      const tb = await A(() => [...document.querySelectorAll('#noteTools .ntb, #notePage')]
        .map(el => { const r = el.getBoundingClientRect();
          return Math.round(Math.min(r.width, r.height)); }));
      check('notes: every toolbar control offers at least 44px',
        tb.length >= 14 && Math.min.apply(null, tb) >= 44,
        'min=' + Math.min.apply(null, tb) + 'px across ' + tb.length + ' controls');
    }
    /* a foreign render mid-formatting: the caret comes back to the same character */
    const caret = await A(() => {
      const ed = document.getElementById('noteBody'); ed.focus();
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let n, t = null;
      while ((n = walker.nextNode())) if (n.data.indexOf('alpha') > -1) { t = n; break; }
      if (!t) return { ok: false };
      const r = document.createRange(); r.setStart(t, 2); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      window.A.render();
      const s2 = getSelection();
      if (!s2.rangeCount) return { ok: false, why: 'no range' };
      const r2 = s2.getRangeAt(0);
      return { ok: true, focus: document.activeElement && document.activeElement.id,
               text: r2.startContainer.data || '', off: r2.startOffset };
    });
    check('notes: a foreign render keeps focus in the editor', caret.ok && caret.focus === 'noteBody', JSON.stringify(caret));
    check('notes: and the caret returns to the same character',
      caret.ok && /alpha/.test(caret.text) && caret.off === 2, JSON.stringify(caret));

    /* a long body grows the page; the pane scrolls, never an inner box */
    const grow = await A(() => {
      const b = document.getElementById('noteBody');
      b.innerHTML = Array.from({ length: 40 }, (_, i) => '<div>line ' + i + ' of the long note</div>').join('');
      b.dispatchEvent(new Event('input', { bubbles: true }));
      return b.scrollHeight - b.clientHeight;
    });
    check('notes: the editor grows with the text, no inner scrollbar', grow <= 2, 'inner=' + grow);

    /* search: filters in place, never touches the editor or steals its focus */
    await act('#noteSearch');
    await page.keyboard.type('packing');
    await sleep(250);
    const sr = await A(() => ({
      rows: [...document.querySelectorAll('.noterow')].length,
      editor: !!document.getElementById('noteBody'),
      focus: document.activeElement && document.activeElement.id,
    }));
    check('notes: search filters the list live', sr.rows === 1, 'rows=' + sr.rows);
    check('notes: the editor survives the filtering', sr.editor);
    check('notes: focus stays in the search box', sr.focus === 'noteSearch', sr.focus);
    const sTop = await A(() => {
      const s = document.getElementById('noteSearch').getBoundingClientRect();
      const l = document.querySelector('.notelist').getBoundingClientRect();
      return Math.round(s.top - l.top);
    });
    check('notes: search sits at the top of the list, no hunting', sTop <= 60, 'offset=' + sTop);
    await audit('notes-search');
    await A(() => { const s = document.getElementById('noteSearch');
      s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); });

    /* pin: the note rises, marks itself, and the button answers */
    await act({ css: '[data-action="note-pin"]' });
    const pin = await A(() => {
      const n = window.A.state.notes.find(x => x.title === 'Packing list');
      const rows = [...document.querySelectorAll('.noterow')];
      return { pinned: !!(n && n.pinned), top: !!(rows[0] && n && rows[0].dataset.id === n.id),
               mark: !!(rows[0] && rows[0].querySelector('.nt svg')),
               btn: (document.querySelector('[data-action="note-pin"]') || {}).textContent || '' };
    });
    check('notes: pin marks the note', pin.pinned);
    check('notes: a pinned note rises to the top of the list', pin.top);
    check('notes: the pinned row carries its mark', pin.mark);
    check('notes: the button flips to Unpin', /Unpin/.test(pin.btn), pin.btn);
    await audit('notes-pinned');

    /* the on-screen keyboard: height shrinks, width holds, and the app re-renders
       only on width change, so typing must simply continue in place */
    if (coarse) {
      await act('#noteBody');
      await page.setViewport({ width: prof.width, height: Math.round(prof.height * 0.55),
        hasTouch: true, isMobile: true });
      await sleep(300);
      await page.keyboard.type(' keyboard up');
      const kb = await A(() => ({
        body: (window.A.state.notes.find(x => x.title === 'Packing list') || {}).body || '',
        focus: document.activeElement && document.activeElement.id,
        over: (document.scrollingElement || document.documentElement).scrollWidth > window.innerWidth,
      }));
      check('notes: typing continues with the keyboard up', /keyboard up/.test(kb.body));
      check('notes: focus stays in the body under the shrunk viewport', kb.focus === 'noteBody', kb.focus);
      check('notes: no sideways overflow with the keyboard up', !kb.over);
      const reach = await A(() => { const b = document.getElementById('noteBody');
        b.scrollIntoView({ block: 'end' }); const r = b.getBoundingClientRect();
        return r.bottom > 0 && r.bottom <= window.innerHeight + 4; });
      check('notes: the end of the editor can be brought into view', reach);
      /* the toolbar stays usable with the keyboard up: toggle bold at the caret,
         type, and the weight lands */
      await act({ css: '.ntb[data-cmd="bold"]' });
      await page.keyboard.type('xy');
      const kbBold = await A(() =>
        (window.A.state.notes.find(x => x.title === 'Packing list') || {}).body || '');
      check('notes: the toolbar works with the keyboard up', /<b>[^<]*xy/.test(kbBold),
        kbBold.slice(-80));
      await audit('notes-keyboard');
      await page.setViewport({ width: prof.width, height: prof.height, hasTouch: true, isMobile: true });
      await sleep(300);
    }

    await act({ css: '.noterow', text: 'Untitled' });
    const emptyId = await A(() => (window.A.state.notes.find(n => !n.title) || {}).id);
    await act({ css: '[data-action="note-del"]' });
    const left = await A(() => window.A.state.notes.length);
    check('notes: delete leaves one note', left === 1, 'notes=' + left);
    await A(() => window.A.save());
    const binned = await page.evaluate(id => !!(id && window.A.state.bin[id]), emptyId);
    check('notes: the deleted note waits in the bin', binned);
    /* park a known rich body on the survivor and send it to the bin: the bin flow
       brings it back through the real Restore button, formatting and all */
    await act({ css: '.noterow', text: 'Packing list' });
    await A(() => { const ed = document.getElementById('noteBody');
      ed.innerHTML = '<div>keep <b>this bold</b> through the bin</div>';
      ed.dispatchEvent(new Event('input', { bubbles: true })); });
    await A(() => window.A.save());
    richNoteId = await A(() => window.A.state.settings.noteSel);
    await act({ css: '[data-action="note-del"]' });
    await A(() => window.A.save());
    const binnedRich = await page.evaluate(id => !!(id && window.A.state.bin[id]), richNoteId);
    check('notes: the rich note waits in the bin', binnedRich);
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
    const back = await A(() => window.A.state.settings.view);
    check('notes: back to the board', back === 'board', back);
  });

  /* ---- J. the bin (through the Menu on narrow layouts) ---- */
  await flow('bin', async () => {
    /* flush the 400ms save debounce first: the bin modal renders from state.bin,
       which the last deletion only reaches at commit, and the modal does not
       refresh itself when a commit lands while it is open */
    await A(() => window.A.save());
    if (narrow) {
      await act('#railtoggle');
      const open = await A(() => document.querySelector('#rail').classList.contains('open'));
      check('menu: opens on narrow layout', open);
      await audit('menu-open');
    }
    await act({ css: '.railfoot [data-action="bin"]' });
    await page.waitForSelector('#binModal');
    const ids = await A(() => window.A.binList().map(x => x.id));
    check('bin: holds this session\'s deletions', ids.length >= 2, ids.length + ' rows');
    await audit('bin-modal', { root: '#modalRoot .modal' });
    /* the rich note first, through the real button: formatting must come back whole */
    if (richNoteId) {
      await act({ css: '[data-action="bin-restore"][data-id="' + richNoteId + '"]' });
      const richBack = await page.evaluate(id => {
        const n = window.A.state.notes.find(x => x.id === id); return n ? n.body : null;
      }, richNoteId);
      check('bin: the rich note restores with formatting intact',
        richBack === '<div>keep <b>this bold</b> through the bin</div>', String(richBack));
    }
    const ids2 = await A(() => window.A.binList().map(x => x.id));
    await act({ css: '[data-action="bin-restore"][data-id="' + ids2[0] + '"]' });
    await act({ css: '[data-action="bin-purge"][data-id="' + ids2[1] + '"]' });
    const left = await A(() => window.A.binList().length);
    check('bin: restore and purge both shrink the list', left === ids2.length - 2, ids2.length + '->' + left);
    if (left > 0) {
      await act({ css: '[data-action="bin-empty"]' });
      await audit('bin-empty-confirm', { root: '#modalRoot .modal' });
      await act({ css: '[data-action="bin-empty-yes"]' });
      const after = await A(() => document.querySelectorAll('#binModal .binrow').length);
      check('bin: emptied', after === 0, after + ' rows');
    }
    await act({ css: '#binModal [data-action="mclose"]' });
    const closed = await A(() => !document.querySelector('#binModal'));
    check('bin: closed', closed);
  });

  /* ---- K. the sync modal (no network: generate and copy only) ---- */
  await flow('sync-modal', async () => {
    await page.keyboard.press('Escape');   /* if an earlier flow died mid-modal */
    await sleep(150);
    await act({ css: '.railfoot [data-action="sync"]' });
    await page.waitForSelector('#syncModal');
    await audit('sync-modal', { root: '#modalRoot .modal' });
    await act({ css: '[data-action="sync-gen"]' });
    const key = await page.$eval('#syncKeyIn', el => el.value);
    check('sync: generate fills a key', /^hs-/.test(key), key.slice(0, 8));
    await act({ css: '[data-action="sync-copy"]' });
    const toast = await A(() => document.querySelector('#toast').textContent.trim());
    check('sync: copy answers with a toast', toast.length > 0, toast.slice(0, 40));
    const connected = await A(() => window.A.sync.key);
    check('sync: nothing connected by the pass', connected === '', connected);
    await act({ css: '#syncModal [data-action="mclose"]' });
    if (narrow) await act('#railtoggle');
  });

  /* ---- L. final state ---- */
  await flow('final', async () => {
    await audit('final');
  });

  await ctx.close();
  return R;
}

/* ---------- report ---------- */
function summarize(results) {
  let hard = 0;
  const lines = [];
  for (const R of results) {
    const p = R.profile;
    lines.push('');
    lines.push('== ' + p.name + '  ' + p.width + 'x' + p.height + '  ' +
      (p.coarse ? 'coarse pointer, no hover' : 'fine pointer, hover') + ' ==');
    lines.push('   media: ' + JSON.stringify(R.media));
    const failed = R.checks.filter(c => !c.ok);
    lines.push('   flows: ' + R.checks.filter(c => c.ok).length + ' checks passed, ' +
      failed.length + ' failed' + (R.flowErrors.length ? ', ' + R.flowErrors.length + ' flow errors' : ''));
    failed.forEach(c => { hard++; lines.push('   FAIL ' + c.name + '  [' + c.detail + ']'); });
    R.flowErrors.forEach(e => { hard++; lines.push('   FLOW ERROR ' + e); });
    for (const a of R.audits) {
      const bits = [];
      if (a.error) bits.push('ERROR ' + a.error);
      if (a.overflow && a.overflow.over)
        bits.push('H-OVERFLOW scrollWidth=' + a.overflow.scrollWidth + ' > innerWidth=' + a.overflow.innerWidth);
      if (a.hitMisses.length) bits.push(a.hitMisses.length + ' hit-miss');
      if (a.small.length) bits.push(a.small.length + ' under-' + MIN_TARGET);
      if (a.blank.length) bits.push(a.blank.length + ' blank-label');
      if (a.white.length) bits.push(a.white.length + ' white');
      lines.push('   audit ' + a.name.padEnd(18) + ' ' + String(a.counted).padStart(3) + ' controls  ' +
        (bits.length ? bits.join('; ') : 'clean'));
      a.hitMisses.forEach(h => { hard++; lines.push('      HIT-MISS ' + h.el + ' -> ' + h.hit + ' @' + h.at); });
      a.small.forEach(s => { hard++; lines.push('      UNDER-' + MIN_TARGET + ' ' + s); });
      a.blank.forEach(b => { hard++; lines.push('      BLANK ' + b); });
      a.white.forEach(w => { hard++; lines.push('      WHITE ' + w); });
    }
  }
  lines.push('');
  lines.push(hard === 0 ? 'VIEWPORTS: clean across ' + results.length + ' profiles'
    : 'VIEWPORTS: ' + hard + ' defects across ' + results.length + ' profiles');
  return { text: lines.join('\n'), hard };
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true,
    args: ['--disable-lcd-text', '--force-color-profile=srgb'] });
  const results = [];
  try {
    for (const prof of PROFILES) {
      process.stdout.write('running ' + prof.name + '...\n');
      results.push(await runProfile(browser, base, prof));
    }
  } finally {
    await browser.close();
    srv.close();
  }
  const { text, hard } = summarize(results);
  console.log(text);
  fs.writeFileSync(path.join(__dirname, 'viewports-report.json'), JSON.stringify(results, null, 1));
  process.exit(hard === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
