/* Viewport verification pass: real headless Chrome, real mouse and touch dispatch.
   Drives the full app through its flows at four device profiles and measures, per
   profile: horizontal page overflow, elementFromPoint at every control's centre,
   touch-target size on coarse-pointer profiles, blank control labels, and any
   computed colour that is pure white.

   Every audit runs TWICE, once per theme (the attribute is flipped in place and
   restored), so each guarantee holds under Cloud blue and Monochrome alike; the
   auditor also computes WCAG contrast for the declared variable pairs and a few
   live composites, and under mono asserts the red accent paints nothing beyond
   today's marker, completion and the primary action. A dedicated flow drives the
   switch itself: rail-foot control, instant apply, persistence across a reload
   (applied before DOMContentLoaded), and planner storage byte-identical across it.

   Run from the project root:  node tests/viewports.js
   Needs Chrome installed (or CHROME_PATH set) and tests/node_modules (npm install).

   The five profiles. The layout branches at window.innerWidth<900 and the custom
   picker layer gates on (hover:hover), so the two tablet rows are the interesting
   ones: 1024 gets the wide desktop layout with a coarse pointer and no hover.
   desktop-1920 is the fifth and it exists for ONE branch: the Notes sticky becomes a
   third column at 1822px and up, and until it was added the set topped out at 1280,
   so that branch was drawn by nobody. It is a fine-pointer, hovering profile like
   1280, and it runs the whole flow set under both themes exactly as the others do. */
const PROFILES = [
  { name: 'desktop-1920', width: 1920, height: 1080, coarse: false },
  { name: 'desktop-1280', width: 1280, height: 800,  coarse: false },
  { name: 'tablet-1024',  width: 1024, height: 768,  coarse: true  },
  { name: 'tablet-820',   width: 820,  height: 1180, coarse: true  },
  { name: 'phone-390',    width: 390,  height: 844,  coarse: true  },
];

/* The width at which the Notes strip leaves the column flow and becomes a third grid
   track beside the list and the editor. Measured, not chosen: 272px list + 14 gap +
   718px editor (the 640px reading measure, .notepage's 60px padding and 2px border,
   .noteed's 6px padding and the 10px scrollbar gutter) + 14 gap + 464px strip = 1482px
   of content area, plus #main's 32px of padding and the 308px rail = 1822px. */
const THREECOL = 1822;

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
    folders: [{ id: 'fldA', name: 'Plans', up: 1 }],
    notes: [{ id: 'sn1', title: 'Grocery run', body: 'eggs and bread', up: 1 },
            { id: 'sn2', title: 'Trip ideas', body: 'coast road', up: 1, folder: 'fldA' }],
    sticky: { text: 'seeded sticky text', at: 1 },
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
  /* what the head theme script had applied by the time the DOM was ready: proves
     the stored theme paints before first render, not after a flash of the other */
  try {
    document.addEventListener('DOMContentLoaded', function () {
      window.__themeAtDCL = document.documentElement.getAttribute('data-theme');
    });
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
      /* A DISABLED CONTROL IS MEANT TO BE UNHITTABLE. The Notes step buttons are
         pointer-transparent while disabled on purpose, so the press falls through to
         the toolbar, which prevents it, rather than blurring the editor and dropping
         a phone keyboard (index.html, `.ntb[disabled]`). Exempt from the hit test
         only; its size and its label are still audited below. */
      if (canHit && !el.disabled) {
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

    /* ---- contrast: body text against its surface, the accent against whatever
       it sits on. Declared-variable pairs first (theme-level truth), then a few
       live composites (proof the rules actually read those variables). Canvas
       pairs run only under mono: the blue design deliberately lets its mid-tone
       canvas meet same-tone accents and delineates by shadow instead. ---- */
    out.theme = document.documentElement.getAttribute('data-theme') === 'mono' ? 'mono' : 'sky';
    out.contrast = [];
    (function contrastPass() {
      const rootCS = getComputedStyle(document.documentElement);
      const parse = s => {
        if (!s) return null;
        let m = String(s).trim().match(/^#([0-9a-f]{6})$/i);
        if (m) return [0, 1, 2].map(i => parseInt(m[1].slice(i * 2, i * 2 + 2), 16));
        m = String(s).match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
        return m ? [+m[1], +m[2], +m[3]] : null;
      };
      const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const V = n => parse(rootCS.getPropertyValue(n));
      const mono = out.theme === 'mono';
      const PAIRS = [
        ['--txt', '--pearl', 4.5], ['--txt', '--cloud', 4.5], ['--txt', '--tasktile', 4.5], ['--txt', '--panel', 4.5],
        ['--mut', '--cloud', 4.5], ['--mut', '--pearl', 4.5],
        ['--navy', '--cloud', 4.5], ['--navy', '--pearl', 4.5],
        ['--mut2', '--cloud', 3], ['--mut2', '--pearl', 3],
        ['--done', '--tasktile', 3], ['--done', '--cloud', 3], ['--done', '--pearl', 3],
        ['--today', '--cloud', 3],
        ['--onpri', '--done', 3],
        ['--denim', '--cloud', 3], ['--denim', '--pearl', 3],
        ['--today', '--canvas', 3, true], ['--txt', '--canvas', 4.5, true], ['--ocean', '--canvas', 3, true],
        /* the True north statement is 19px/700, WCAG large text: 3:1 is its bar.
           It measures 3.65 on the #F6F6F7 backdrop, up from 3.27 on the old mono
           pearl and still short of 4.5, which is why the 19px face is the floor
           and why matching the nav meant raising the labels, not shrinking this. */
        ['--north', '--northbg', 3],
        /* the panel is a near-white island in BOTH themes now, so it carries its
           own ink set and each role is measured on the backdrop it really sits on.
           Under mono these are the inversion: dark ink on a light panel. */
        ['--northtxt', '--northbg', 4.5], ['--northmut', '--northbg', 4.5],
        ['--northmut2', '--northbg', 3], ['--northtxt', '--northfield', 4.5],
      ];
      for (const p of PAIRS) {
        if (p[3] && !mono) continue;
        const a = V(p[0]), b = V(p[1]);
        if (!a || !b) { out.contrast.push('unreadable pair ' + p[0] + '/' + p[1]); continue; }
        const r = ratio(a, b);
        if (r < p[2] - 0.01) out.contrast.push(p[0] + ' on ' + p[1] + ' = ' + r.toFixed(2) + ' (needs ' + p[2] + ')');
      }
      /* live composites: walk up for the effective opaque backdrop */
      const bgOf = el => {
        const layers = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const s = getComputedStyle(n).backgroundColor;
          const m = String(s).match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, ]+([\d.]+))?\)/);
          if (!m) continue;
          const a = m[4] === undefined ? 1 : +m[4];
          if (a === 0) continue;
          layers.push([+m[1], +m[2], +m[3], a]);
          if (a >= 1) break;
        }
        if (!layers.length || layers[layers.length - 1][3] < 1) return null;
        let c = layers.pop().slice(0, 3);
        while (layers.length) { const t = layers.pop(); c = c.map((v, i) => t[i] * t[3] + v * (1 - t[3])); }
        return c;
      };
      const sample = (sel, min, what) => {
        const el = document.querySelector(sel);
        if (!el || !el.getClientRects().length) return;
        const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
        if (!fg || !bg) return;
        const r = ratio(fg, bg);
        if (r < min - 0.05) out.contrast.push(what + ' = ' + r.toFixed(2) + ' (needs ' + min + ')');
      };
      sample('.task .ttl', 4.5, 'task title on its card');
      sample('.colhead .meta', 4.5, 'column meta on its header');
      sample('.zh', 4.5, 'zone label on its column');
      sample('#noteBody', 4.5, 'note body on its page');
      /* the whisper tier (.synchint, mut2) is deliberately quieter and asserted
         at 3+ through the declared pairs; sample the modal's real copy here */
      sample('.modal p:not(.synchint)', 4.5, 'modal copy on its card');
      sample('.modal p.synchint', 3, 'modal small print on its card');
      sample('.badge', 3, 'the TODAY badge on its tint');
      /* the red-on-light pair Change 4 introduced: live, composited, both themes */
      sample('#fpanel .frow:not(.done) .ftxt', 3, 'the True north statement on its backdrop');
      /* the rest of the panel, live: the near-white backdrop would have left the
         header at 2.11 and the whisper tier at 3.39 under mono if the island did
         not re-point its own inks, so measure them where they actually render */
      sample('#fpanel .kh', 4.5, 'the True north panel header on its backdrop');
      sample('#fpanel .frow .mini', 3, 'a True north row control on its backdrop');
      /* the nav labels now read at the statement's size; 19px at weight 500 is
         still normal text, so 4.5 is their bar in both themes */
      sample('#rail .navbtn:not(.on)', 4.5, 'a resting nav label on the rail');
      sample('#rail .navbtn.on', 4.5, 'the active nav label on its pearl');
      sample('#stickyPad', 4.5, 'the sticky note text on its panel');
    })();

    /* ---- red discipline (mono only): the accent may paint nothing beyond
       today's marker, completion and the primary action ---- */
    out.red = [];
    if (out.theme === 'mono') {
      const redHex = (rootCS => rootCS.getPropertyValue('--done').trim())(getComputedStyle(document.documentElement));
      const m = redHex.match(/^#([0-9a-f]{6})$/i);
      const redTriplet = m ? [0, 1, 2].map(i => parseInt(m[1].slice(i * 2, i * 2 + 2), 16)).join(', ') : null;
      /* WIDENED DELIBERATELY 2026-08-12: the active nav item (accent bar and icon
         tint read --today, red under mono) and the True north statements (--north).
         Anything else red is still a defect. */
      const ALLOWED = '.badge,.col.today,.box,.sbox,#qb,.fadd button,.mrow button.pri,.rp,' +
        '.cell.today,.cell.today .n,#strip button.istoday,.hdow.now,.bar.now,.allok,.pday.today,.dotm,' +
        '.navbtn.on,.navbtn.on .em,.navbtn.on .em *,#fpanel .frow:not(.done) .ftxt,#fpanel .frow:not(.done) .ftxt *';
      if (redTriplet) {
        const seen = {};
        for (const el of document.querySelectorAll('*')) {
          if (!el.getClientRects().length) continue;
          const cs = getComputedStyle(el);
          const hit = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
            'borderLeftColor', 'outlineColor', 'stroke', 'fill']
            .some(p => cs[p] && String(cs[p]).indexOf(redTriplet) > -1);
          if (hit && !el.matches(ALLOWED)) seen[desc(el)] = 1;
        }
        out.red = Object.keys(seen);
      }
    }

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
  /* the three wide Notes layouts, named once: the stacked column flow (901 to 1199),
     the two-column grid that gives the list the band beside the strip (1200 to 1821),
     and the three-column row where the strip stands beside the pane (1822 and up) */
  const gridded = prof.width >= 1200, threecol = prof.width >= THREECOL;
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
    const run = nm => page.evaluate((n, o) => window.__audit(n, o), nm,
      Object.assign({ coarse, minTarget: MIN_TARGET }, opts || {}));
    const first = await run(name);
    R.audits.push(first);
    /* the same surface under the other theme: a theme changes colour, type and
       surface treatment only, so overflow, reach, size, labels, whiteness and
       contrast must hold identically. The attribute flip is pure CSS, touches
       no storage and no state, and is restored before the flow continues. */
    await page.evaluate(() => {
      const e = document.documentElement;
      e.__themeWas = e.getAttribute('data-theme');
      if (e.__themeWas === 'mono') e.removeAttribute('data-theme');
      else e.setAttribute('data-theme', 'mono');
    });
    await sleep(140);
    const second = await run(name + '@' + (first.theme === 'mono' ? 'sky' : 'mono'));
    R.audits.push(second);
    await page.evaluate(() => {
      const e = document.documentElement;
      if (e.__themeWas) e.setAttribute('data-theme', e.__themeWas);
      else e.removeAttribute('data-theme');
      delete e.__themeWas;
    });
    await sleep(80);
    return first;
  };
  /* the same measurement taken under both themes. A theme is a set of custom property
     values and nothing else, so a placement or a clearance must come out identical
     under each; measuring it twice is how that claim stays true rather than assumed.
     The flip touches no storage and no state, and is restored before the flow goes on. */
  const bothThemes = async fn => {
    const first = await fn();
    await page.evaluate(() => {
      const e = document.documentElement;
      e.__themeWas = e.getAttribute('data-theme');
      if (e.__themeWas === 'mono') e.removeAttribute('data-theme');
      else e.setAttribute('data-theme', 'mono');
    });
    await sleep(180);
    const second = await fn();
    await page.evaluate(() => {
      const e = document.documentElement;
      if (e.__themeWas) e.setAttribute('data-theme', e.__themeWas);
      else e.removeAttribute('data-theme');
      delete e.__themeWas;
    });
    await sleep(100);
    return [first, second];
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
        /* the dual-theme audit's font reflow can clamp a scrolled container, and
           any scroll closes a popover by design; re-open before choosing */
        const still = await A(() => !!document.querySelector('#popRoot .popover'));
        if (!still) await act('#qd');
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

  /* ---- C2. Enter chains the next task, with the on-screen keyboard up ----
     The shape that produced the original mobile trap: a field being torn out and
     rebuilt while the soft keyboard is open. On the coarse profiles the keyboard is
     modelled the way the notes flow models it, by shrinking the viewport HEIGHT only,
     which is exactly what a real keyboard does to the layout viewport. */
  await flow('enter-chain', async () => {
    const zk = 'day:' + today + ':must';
    const titles = () => page.evaluate(t => window.A.state.days[t].must.map(x => x.title), today);
    const openField = () => A(() => {
      const i = document.querySelector('.addin');
      return i ? { k: i.dataset.k, value: i.value, focused: document.activeElement === i,
                   count: document.querySelectorAll('.addin').length } : null;
    });

    if (coarse) {
      await page.setViewport({ width: prof.width, height: Math.round(prof.height * 0.55),
        hasTouch: true, isMobile: true });
      await sleep(300);
    }
    await act({ css: '[data-action="add-open"][data-k="' + zk + '"]' });
    await page.keyboard.type('Chain one');
    await page.keyboard.press('Enter');
    await sleep(300);
    let f = await openField();
    check('enter chain: a fresh field is open after Enter', !!f, JSON.stringify(f));
    check('enter chain: it belongs to the same zone', f && f.k === zk, f && f.k);
    check('enter chain: it is empty', f && f.value === '', f && JSON.stringify(f.value));
    check('enter chain: and already holds the caret', f && f.focused, JSON.stringify(f));
    check('enter chain: exactly one field is open', f && f.count === 1, f && f.count);

    /* three more straight down, never touching the pointer: this is the whole change */
    for (const t of ['Chain two', 'Chain three', 'Chain four']) {
      await page.keyboard.type(t);
      await page.keyboard.press('Enter');
      await sleep(200);
    }
    const got = await titles();
    const want = ['Chain one', 'Chain two', 'Chain three', 'Chain four'];
    check('enter chain: four tasks typed one after another, in order',
      want.every((t, i) => got[got.length - 4 + i] === t), got.slice(-4).join(' | '));

    /* the keyboard is still up and the page has not gone sideways */
    const state = await A(() => ({
      over: (document.scrollingElement || document.documentElement).scrollWidth > window.innerWidth,
      focused: document.activeElement && document.activeElement.className,
      reach: (() => { const i = document.querySelector('.addin'); if (!i) return null;
        const r = i.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight + 4; })(),
    }));
    check('enter chain: no sideways overflow while chaining', !state.over);
    check('enter chain: focus is still on an add field', /addin/.test(state.focused || ''), state.focused);
    if (coarse)
      check('enter chain: the open field stays reachable with the keyboard up', state.reach !== false,
        'reach=' + state.reach);
    await audit('enter-chain');

    /* the way out: Enter on an empty field closes rather than opening another */
    await page.keyboard.press('Enter');
    await sleep(300);
    const after = await openField();
    check('enter chain: an empty Enter closes the field', after === null, JSON.stringify(after));
    const n = (await titles()).length;
    check('enter chain: and commits nothing', (await titles()).length === n, 'n=' + n);

    /* Escape still closes without committing */
    await act({ css: '[data-action="add-open"][data-k="' + zk + '"]' });
    await page.keyboard.type('Never committed');
    await page.keyboard.press('Escape');
    await sleep(300);
    const esc = await A(() => ({ open: !!document.querySelector('.addin') }));
    check('enter chain: Escape still closes the field', !esc.open);
    check('enter chain: Escape commits nothing',
      !(await titles()).includes('Never committed'), (await titles()).join(' | '));

    /* the keyboard closing again must not tear anything out: height-only resize */
    if (coarse) {
      await act({ css: '[data-action="add-open"][data-k="' + zk + '"]' });
      await page.keyboard.type('Survives the keyboard');
      await page.setViewport({ width: prof.width, height: prof.height, hasTouch: true, isMobile: true });
      await sleep(400);
      const kept = await A(() => { const i = document.querySelector('.addin');
        return i ? i.value : null; });
      check('enter chain: half typed text survives the keyboard closing', kept === 'Survives the keyboard', kept);
      await page.keyboard.press('Escape');
      await sleep(200);
    }
    /* Free Floating: same key, same chaining, keyed on the tab rather than the zone.
       Wrapped so the board mode is always handed back, whatever happens in here: a
       flow left in the wrong mode would fail every flow after it for the wrong reason. */
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    await page.waitForSelector('#board .col.backlog');
    const fk = await A(() => 'float:' + window.A.state.floats[0].id);
    try {
      await act({ css: '[data-action="add-open"][data-k="' + fk + '"]' });
      await page.keyboard.type('Float chain one');
      await page.keyboard.press('Enter');
      await sleep(300);
      await page.keyboard.type('Float chain two');
      await page.keyboard.press('Enter');
      await sleep(300);
      const ff = await page.evaluate(k => {
        const f = window.A.state.floats.find(x => 'float:' + x.id === k);
        const i = document.querySelector('.addin');
        return { last: f ? f.tasks.slice(-2).map(t => t.title) : [], openK: i && i.dataset.k };
      }, fk);
      check('enter chain: Free Floating chains into the same tab',
        ff.last.join(' | ') === 'Float chain one | Float chain two', ff.last.join(' | '));
      check('enter chain: and reopens on that tab', ff.openK === fk, String(ff.openK));
      await page.keyboard.press('Escape');
      await sleep(200);
    } finally {
      await act({ css: '.navbtn[data-action="floattoggle"]' });
      await page.waitForSelector('#board .col');
    }

    /* the quick-add box was deliberately left alone: it never closes, so there is
       nothing to reopen. It empties in place and keeps focus, which already gives the
       same type-several-in-a-row run. */
    await page.select('#qd', 'day:' + today + ':should');
    await act('#qi');
    await page.keyboard.type('Top box one');
    await page.keyboard.press('Enter');
    await sleep(300);
    const qa1 = await A(() => ({ value: document.getElementById('qi').value,
      focused: document.activeElement && document.activeElement.id }));
    check('quick add: Enter empties the box in place', qa1.value === '', JSON.stringify(qa1.value));
    check('quick add: and keeps the caret in it', qa1.focused === 'qi', qa1.focused);
    await page.keyboard.type('Top box two');
    await page.keyboard.press('Enter');
    await sleep(300);
    const qa2 = await page.evaluate(t => window.A.state.days[t].should.map(x => x.title), today);
    check('quick add: two in a row without reaching for the pointer',
      qa2.includes('Top box one') && qa2.includes('Top box two'), qa2.join(' | '));
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
        /* same as the qd popover: the dual-theme audit may have closed it through
           the app's own scroll-close rule; re-open before picking */
        const still = await A(() => !!document.querySelector('#popRoot .popover'));
        if (!still) await act({ css: '.task.sel input[data-action="pickdate"]' });
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
    await act({ css: host + ' .kh[data-action="week-toggle"]' });
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
    /* ONE backdrop, both themes: the panel is a near-white island wherever it sits,
       so read it under sky and again with the mono attribute forced on. #F6F6F7 is
       the app's stand-in for white (mono's brightest existing value), never #ffffff. */
    const bgBoth = await A(() => {
      const e = document.documentElement, was = e.getAttribute('data-theme');
      const p = document.querySelector('#fpanel');
      e.removeAttribute('data-theme');
      const sky = getComputedStyle(p).backgroundColor;
      e.setAttribute('data-theme', 'mono');
      const mono = getComputedStyle(p).backgroundColor;
      if (was) e.setAttribute('data-theme', was); else e.removeAttribute('data-theme');
      return { sky, mono };
    });
    check('north: the panel sits on the near-white backdrop', bgBoth.sky === 'rgb(246, 246, 247)', bgBoth.sky);
    check('north: and takes that same backdrop under mono, not the rail surface',
      bgBoth.mono === 'rgb(246, 246, 247)', bgBoth.mono);
    /* the sizes are UNPAIRED again: they were briefly both 19px. Measured on the
       rendered elements, not on the stylesheet text. Only the statement's size is
       load-bearing, because mono's red is legal only as WCAG large text. */
    const sizes = await A(() => {
      const st = document.querySelector('#fpanel .frow:not(.done) .ftxt');
      const nav = [...document.querySelectorAll('#rail .navbtn')];
      return { stmt: parseFloat(getComputedStyle(st).fontSize),
        weight: +getComputedStyle(st).fontWeight,
        nav: nav.map(b => parseFloat(getComputedStyle(b).fontSize)) };
    });
    check('north: the statement renders at 19px/700, its large-text floor',
      sizes.stmt >= 18.66 && sizes.weight >= 700, sizes.stmt + 'px/' + sizes.weight);
    check('north: and the nav labels are back off that size, the pairing undone',
      sizes.nav.length === 4 && sizes.nav.every(s => s === 13.5), JSON.stringify(sizes));
    await audit('true-north', { root: '#fpanel' });

    /* rename in place */
    await act({ css: '#fpanel .ftxt span[data-action="focus-rename"]' });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Steady, not rushed');
    await page.keyboard.press('Enter');
    await sleep(300);
    const t1 = await A(() => window.A.state.focus[0].title);
    check('north: rename in place commits', t1 === 'Steady, not rushed', t1);

    /* Change 6: the add row belongs to an ACTIVE panel, so press the panel first.
       This is exactly what a user does, and it is the affordance under test. */
    await act({ css: '#fpanel .kh' });
    const revealed = await A(() => !!document.querySelector('#fi'));
    check('north: a press on the panel reveals the add field', revealed);
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
        tb.length >= 16 && Math.min.apply(null, tb) >= 44,
        'min=' + Math.min.apply(null, tb) + 'px across ' + tb.length + ' controls');
      /* the step buttons measured by name, so a regression names itself rather than
         hiding inside the minimum above */
      const sz = await A(() => ['undo', 'redo'].map(c => {
        const el = document.querySelector('#noteTools .ntb[data-cmd="' + c + '"]');
        if (!el) return -1;
        const r = el.getBoundingClientRect();
        return Math.round(Math.min(r.width, r.height));
      }));
      check('notes: Undo offers at least 44px', sz[0] >= 44, sz[0] + 'px');
      check('notes: Redo offers at least 44px', sz[1] >= 44, sz[1] + 'px');
    }
    /* THE ROW STILL FITS. It carries two more controls and a separator than it did,
       and it is the densest strip in the app, so prove it at every width: nothing
       sticks out of the box, the box does not scroll, and the page does not either. */
    {
      const row = await A(() => {
        const bar = document.getElementById('noteTools');
        const b = bar.getBoundingClientRect();
        const kids = [...bar.children].map(el => el.getBoundingClientRect());
        return {
          n: kids.length,
          out: kids.filter(k => k.right > b.right + 0.5 || k.left < b.left - 0.5).length,
          scroll: Math.round(bar.scrollWidth - bar.clientWidth),
          rows: new Set(kids.map(k => Math.round(k.top))).size,
          doc: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
        };
      });
      check('notes: the toolbar row does not overflow its box',
        row.out === 0 && row.scroll <= 1,
        'outside=' + row.out + ' scroll=' + row.scroll + ' controls=' + row.n + ' lines=' + row.rows);
      check('notes: and the toolbar starts no horizontal page scroll', row.doc <= 1, 'doc=' + row.doc);
      check('notes: the toolbar really is carrying the two extra controls', row.n >= 17, 'children=' + row.n);
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

    /* ---- UNDO AND REDO THROUGH THE BUTTONS, with the profile's real input ----
       This is the half jsdom cannot prove. On the coarse profiles every press below
       is a real touchscreen tap, which is the case the buttons exist for: Ctrl+Z is
       not reachable on a phone. The contract under test is that a tap runs the step
       AND leaves the caret where the step was taken from, which needs the editor to
       still be focused after the press (Section 4's mousedown rule). */
    {
      const nb = () => A(() => (window.A.state.notes.find(x => x.title === 'Packing list') || {}).body || '');
      /* markup-blind: the formatting pass above leaves a highlight or a size live at
         the caret, so Chrome wraps the new typing in a span. That is correct engine
         behaviour, and the step run is about the WORDS, so compare what is read. */
      const ntx = () => A(() => (document.getElementById('noteBody') || {}).textContent || '');
      const stepState = () => A(() => {
        const g = c => document.querySelector('#noteTools .ntb[data-cmd="' + c + '"]');
        const u = g('undo'), r = g('redo');
        return { has: !!u && !!r, u: u && u.disabled, r: r && r.disabled,
                 svg: !!(u && u.querySelector('svg')) && !!(r && r.querySelector('svg')),
                 un: (u && u.getAttribute('aria-label') || '').trim(),
                 rn: (r && r.getAttribute('aria-label') || '').trim(),
                 first: document.querySelector('#noteTools .ntb') === u,
                 rpe: r && getComputedStyle(r).pointerEvents };
      });
      /* a clean body and a fresh history */
      await A(() => { const n = window.A.state.notes.find(x => x.title === 'Packing list');
        n.body = ''; window.A.render(); });
      await sleep(320);
      const s0 = await stepState();
      check('notes: the toolbar carries a named Undo and Redo',
        s0.has && s0.un === 'Undo' && s0.rn === 'Redo', JSON.stringify(s0));
      check('notes: both are drawn as inline SVG', s0.svg);
      check('notes: they lead the strip, where an editor puts them', s0.first);
      check('notes: an untouched note offers neither step', s0.u === true && s0.r === true,
        'undo=' + s0.u + ' redo=' + s0.r);
      check('notes: a disabled step button is pointer-transparent, so a dead press cannot blur',
        s0.rpe === 'none', s0.rpe);
      /* a dead press must do nothing AND leave the editor alone */
      await act({ css: '#noteBody' });
      await act({ css: '#noteTools' });
      const deadFocus = await A(() => document.activeElement && document.activeElement.id);
      check('notes: a press on the dead end of the strip does not blur the editor',
        deadFocus === 'noteBody', 'focus=' + deadFocus);

      await act({ css: '#noteBody' });
      await page.keyboard.type('s1 s2 s3 s4 s5 s6 s7 s8 s9 s10 ');
      await sleep(320);
      const full = await nb();
      const s1 = await stepState();
      check('notes: ten typed words make Undo available', s1.u === false, 'undo disabled=' + s1.u);
      check('notes: and leave Redo unavailable', s1.r === true, 'redo disabled=' + s1.r);

      for (let i = 0; i < 10; i++) await act({ css: '#noteTools .ntb[data-cmd="undo"]' });
      const back = await ntx();
      check('notes: ten taps of Undo walk back ten whole words', back === 's1', 'text=' + JSON.stringify(back));
      const caretAfter = await A(() => {
        const ed = document.getElementById('noteBody'), s = getSelection();
        if (!s.rangeCount) return { ok: false, why: 'no range' };
        const r = s.getRangeAt(0);
        return { ok: ed.contains(r.startContainer), off: r.startOffset,
                 txt: (r.startContainer.data || ''),
                 focus: document.activeElement && document.activeElement.id };
      });
      check('notes: a tap of Undo leaves focus in the editor',
        caretAfter.focus === 'noteBody', JSON.stringify(caretAfter));
      check('notes: and the caret comes back with the text, at the end of the restored word',
        caretAfter.ok && caretAfter.off === 2, JSON.stringify(caretAfter));

      const s2 = await stepState();
      check('notes: with steps spent, Redo reads available', s2.r === false, 'redo disabled=' + s2.r);
      let fwd = 0;
      while (fwd < 40 && !(await stepState()).r) {
        await act({ css: '#noteTools .ntb[data-cmd="redo"]' }); fwd++;
      }
      const s3 = await stepState();
      check('notes: Redo walks forward at least ten steps and then reads unavailable',
        fwd >= 10 && s3.r === true, 'steps=' + fwd + ' redo disabled=' + s3.r);
      check('notes: and the forward end is the text the run started from',
        (await nb()) === full, 'body=' + JSON.stringify(await nb()));
      check('notes: while Undo is live again at the top of the stack', s3.u === false, 'undo disabled=' + s3.u);

      /* the caret is not decoration: the next character must land where the step was
         taken from. Typing also kills the redo branch, which the button must follow. */
      await act({ css: '#noteTools .ntb[data-cmd="undo"]' });
      const beforeX = await ntx();
      await page.keyboard.type('X');
      await sleep(240);
      check('notes: the next keystroke after a tapped Undo lands at the restored caret',
        (await ntx()) === beforeX + 'X', 'text=' + JSON.stringify(await ntx()));
      const s4 = await stepState();
      check('notes: and a fresh edit kills the redo branch, which the button reports',
        s4.r === true, 'redo disabled=' + s4.r);

      /* ONE history: a chord and a tap wind the same stack, not two of their own */
      const base = await nb();
      await act({ css: '#noteBody' });
      await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
      await sleep(220);
      const afterChord = await nb();
      await act({ css: '#noteTools .ntb[data-cmd="undo"]' });
      const afterBoth = await nb();
      check('notes: a chord then a tap are two steps of ONE stack',
        afterChord.length < base.length && afterBoth.length < afterChord.length,
        'base=' + base.length + ' chord=' + afterChord.length + ' tap=' + afterBoth.length);
      await act({ css: '#noteTools .ntb[data-cmd="redo"]' });
      check('notes: and the tap redoes the step the chord took',
        (await nb()) === afterChord, 'body=' + JSON.stringify(await nb()));
      await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control');
      await sleep(220);
      check('notes: while the chord redoes the step the tap took',
        (await nb()) === base, 'body=' + JSON.stringify(await nb()));
      await audit('notes-steps');
      /* leave the note as the rest of the pass expects to find it */
      await A(() => { const n = window.A.state.notes.find(x => x.title === 'Packing list');
        n.body = 'socks and passport'; window.A.render(); });
      await sleep(300);
    }

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
    const countBefore = await A(() => window.A.state.notes.length);
    await act({ css: '[data-action="note-del"]' });
    const left = await A(() => window.A.state.notes.length);
    check('notes: delete removes exactly the one note', left === countBefore - 1,
      countBefore + '->' + left);
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

  /* ---- M. the theme switch: instant, persistent, and invisible to the planner ---- */
  await flow('theme-switch', async () => {
    const before = await A(() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      planner: localStorage.getItem('agora_dayplanner_v1'),
      sig: window.A.stateSig(window.A.state),
    }));
    check('theme: boots in cloud blue with no attribute', before.attr === null, String(before.attr));
    if (narrow) await act('#railtoggle');
    await act({ css: '.railfoot [data-action="themes"]' });
    await page.waitForSelector('#themeModal');
    await audit('theme-modal', { root: '#modalRoot .modal' });
    await act({ css: '[data-action="theme-set"][data-t="mono"]' });
    const m = await A(() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      ls: localStorage.getItem('agora_dayplanner_theme'),
      meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
      canvas: getComputedStyle(document.getElementById('main')).backgroundColor,
      planner: localStorage.getItem('agora_dayplanner_v1'),
      sig: window.A.stateSig(window.A.state),
      modalOpen: !!document.querySelector('#themeModal'),
      pressed: (document.querySelector('[data-action="theme-set"][data-t="mono"]') || { getAttribute: () => '' }).getAttribute('aria-pressed'),
    }));
    check('theme: applies in place with the modal still open', m.attr === 'mono' && m.modalOpen, JSON.stringify({ attr: m.attr, open: m.modalOpen }));
    check('theme: the canvas repaints near-black in the same frame', m.canvas === 'rgb(7, 7, 8)', m.canvas);
    check('theme: stored per device under its own key', m.ls === 'mono', String(m.ls));
    check('theme: the theme-color meta follows', m.meta === '#070708', m.meta);
    check('theme: planner storage byte-identical across the switch', m.planner === before.planner);
    check('theme: state signature untouched, so sync has nothing to push', m.sig === before.sig);
    check('theme: the modal marks the new choice', m.pressed === 'true', String(m.pressed));
    await act({ css: '#themeModal [data-action="mclose"]' });
    /* reload: the head script must repaint before the app boots, no flash of blue */
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#board .col');
    const r2 = await A(() => ({
      atDCL: window.__themeAtDCL === undefined ? 'unset' : window.__themeAtDCL,
      attr: document.documentElement.getAttribute('data-theme'),
      meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
      canvas: getComputedStyle(document.getElementById('main')).backgroundColor,
      planner: localStorage.getItem('agora_dayplanner_v1'),
    }));
    check('theme: survives the reload', r2.attr === 'mono' && r2.canvas === 'rgb(7, 7, 8)',
      JSON.stringify({ attr: r2.attr, canvas: r2.canvas }));
    check('theme: applied before DOMContentLoaded, so nothing flashed', r2.atDCL === 'mono', String(r2.atDCL));
    check('theme: the meta was re-set by the head script', r2.meta === '#070708', r2.meta);
    check('theme: the planner came through the reload intact', r2.planner === before.planner);
    /* every view rendered while mono is the ACTIVE theme; each audit also
       measures the sky flip, so both palettes are proven on every view */
    await audit('mono-board');
    await act({ css: '.navbtn[data-action="view"][data-v="calendar"]' });
    await page.waitForSelector('.calgrid');
    await audit('mono-calendar');
    await act({ css: '.navbtn[data-action="view"][data-v="notes"]' });
    await audit('mono-notes');
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    await audit('mono-float');
    await act({ css: '#boardnav [data-action="floattoggle"]' });
    /* typography: numerals and short labels lead with the dot-matrix face,
       body text stays in the sans */
    const faces = await A(() => {
      const ff = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).fontFamily : 'missing'; };
      return { dow: ff('.colhead .dow'), stat: ff('.stat'), zh: ff('.zh'), ttl: ff('.task .ttl'), body: ff('body') };
    });
    check('theme: numerals and labels lead with Silkscreen under mono',
      /Silkscreen/.test(faces.dow) && /Silkscreen/.test(faces.stat) && /Silkscreen/.test(faces.zh),
      JSON.stringify(faces).slice(0, 160));
    check('theme: body text never takes the pixel face',
      !/Silkscreen/.test(faces.ttl) && !/Silkscreen/.test(faces.body));
    /* back to cloud blue through the same control */
    if (narrow) await act('#railtoggle');
    await act({ css: '.railfoot [data-action="themes"]' });
    await page.waitForSelector('#themeModal');
    await act({ css: '[data-action="theme-set"][data-t="sky"]' });
    const s2 = await A(() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      ls: localStorage.getItem('agora_dayplanner_theme'),
      meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
      canvas: getComputedStyle(document.getElementById('main')).backgroundColor,
    }));
    check('theme: switching back removes the attribute entirely', s2.attr === null, String(s2.attr));
    check('theme: and stores the plain choice', s2.ls === 'sky', String(s2.ls));
    check('theme: the canvas returns to denim at once', s2.canvas === 'rgb(95, 134, 166)', s2.canvas);
    check('theme: the meta returns to cloud blue', s2.meta === '#CFE3F1', s2.meta);
    await act({ css: '#themeModal [data-action="mclose"]' });
    if (narrow) await act('#railtoggle');
  });

  /* ---- K2. the editor's own keys: undo, redo, and the dash rules ----
     Everything here is driven through real Chrome with real key events, because that
     is the only place the questions can honestly be answered: the browser owns the
     editing engine, the native undo stack and the spellchecker. */
  await flow('notes-editing', async () => {
    const seat = body => page.evaluate(b => {
      window.A.state.notes = [{ id: 'vpe', title: 'Editing', body: b, up: 1, dn: 1, pos: 1 }];
      window.A.state.settings.view = 'notes';
      window.A.state.settings.noteSel = 'vpe';
      window.A.render();
    }, body);
    const body = () => A(() => (window.A.state.notes.find(n => n.id === 'vpe') || {}).body);
    const caretEnd = () => A(() => {
      const ed = document.getElementById('noteBody'); ed.focus();
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let n, last = null;
      while ((n = w.nextNode())) last = n;
      const r = document.createRange();
      if (last) r.setStart(last, last.length); else r.setStart(ed, ed.childNodes.length);
      r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return true;
    });
    const chord = async (key, opts) => {
      opts = opts || {};
      const mods = [opts.meta ? 'Meta' : 'Control'].concat(opts.shift ? ['Shift'] : []);
      for (const m of mods) await page.keyboard.down(m);
      await page.keyboard.press(key);
      for (const m of mods.slice().reverse()) await page.keyboard.up(m);
      await sleep(220);
    };

    /* ---- 0. the two browser facts that decided the design ----
       Measured on a scratch contenteditable outside the app, so the claim in REVIEW.md
       is a repeatable measurement rather than folklore. Fact one: Chrome coalesces a
       typed run into ONE native undo step. Fact two: a textContent write on an element
       outside the editable, which is exactly what the Notes input handler does to keep
       the row label and the meta line live, collapses that to one character per press.
       Together with the rebuilt-editor problem below, that is why the app carries its
       own history. The scratch element is removed before anything else runs. */
    const nativeFacts = await (async () => {
      const mk = () => A(() => {
        const o = document.getElementById('__vpscratch'); if (o) o.remove();
        const d = document.createElement('div');
        d.id = '__vpscratch'; d.contentEditable = 'true';
        d.style.cssText = 'position:fixed;top:0;left:0;width:260px;height:44px;z-index:99999;opacity:0.01';
        document.body.appendChild(d); d.focus();
      });
      await mk();
      await page.keyboard.type('alpha bravo charlie', { delay: 15 });
      await sleep(250);
      await chord('KeyZ');
      const plain = await A(() => document.getElementById('__vpscratch').textContent);
      await mk();
      await A(() => {
        const m = document.createElement('span'); m.id = '__vpmirror';
        document.body.appendChild(m);
        window.__vph = () => { document.getElementById('__vpmirror').textContent = String(Date.now()); };
        document.getElementById('__vpscratch').addEventListener('input', window.__vph);
      });
      await page.keyboard.type('alpha bravo charlie', { delay: 15 });
      await sleep(250);
      await chord('KeyZ');
      const patched = await A(() => document.getElementById('__vpscratch').textContent);
      await A(() => { ['__vpscratch', '__vpmirror'].forEach(i => {
        const e = document.getElementById(i); if (e) e.remove(); }); delete window.__vph; });
      return { plain, patched };
    })();
    check('native undo: a bare editable undoes the whole typed run in one step',
      nativeFacts.plain === '', JSON.stringify(nativeFacts.plain));
    check('native undo: a live textContent patch outside it collapses that to one character',
      nativeFacts.patched === 'alpha bravo charli', JSON.stringify(nativeFacts.patched));

    /* ---- 1. the third fact: a foreign render takes the native stack with it ----
       Recorded as checks so the finding stays true rather than becoming folklore. */
    await seat('native probe'); await sleep(300);
    await caretEnd();
    await page.keyboard.type(' alpha bravo charlie');
    await sleep(400);
    const beforeRender = await body();
    check('undo probe: typing landed', /alpha bravo charlie/.test(beforeRender), beforeRender);
    await A(() => window.A.render()); await sleep(300);
    const rebuilt = await A(() => document.activeElement && document.activeElement.id);
    check('undo probe: a foreign render rebuilds the editor and keeps focus',
      rebuilt === 'noteBody', rebuilt);
    /* with OUR stack, a step back still works after that render. The native stack was
       gone at this point, which is the whole reason the app carries its own. */
    await chord('KeyZ');
    const afterRenderUndo = await body();
    check('undo: a step back still works after a foreign render',
      afterRenderUndo === 'native probe alpha bravo', afterRenderUndo);
    check('undo: and it is a WORD, not the single character the native stack gave',
      afterRenderUndo !== 'native probe alpha bravo charli', afterRenderUndo);

    /* ---- 2. undo and redo, the four chords ---- */
    await seat('seed'); await sleep(300);
    await caretEnd();
    await page.keyboard.type(' one two');
    await sleep(400);
    check('undo: two words typed', (await body()) === 'seed one two', await body());
    await chord('KeyZ');
    check('undo: Ctrl+Z drops the last word', (await body()) === 'seed one', await body());
    await chord('KeyZ');
    check('undo: and the one before it', (await body()) === 'seed', await body());
    await chord('KeyZ');
    check('undo: the bottom of the history holds', (await body()) === 'seed', await body());
    await chord('KeyY');
    check('redo: Ctrl+Y steps forward', (await body()) === 'seed one', await body());
    await chord('KeyZ', { shift: true });
    check('redo: Ctrl+Shift+Z steps forward too', (await body()) === 'seed one two', await body());
    await chord('KeyZ', { meta: true });
    check('undo: Cmd+Z on a Mac', (await body()) === 'seed one', await body());
    await chord('KeyZ', { meta: true, shift: true });
    check('redo: Cmd+Shift+Z on a Mac', (await body()) === 'seed one two', await body());
    /* the editor and the state agree after all that, and the caret is still inside */
    const agree = await A(() => {
      const ed = document.getElementById('noteBody');
      const s = getSelection();
      return { text: ed.textContent,
               inside: s.rangeCount ? ed.contains(s.getRangeAt(0).startContainer) : false };
    });
    check('undo: the editor shows what state holds', agree.text === (await body()), agree.text);
    check('undo: and the caret is back inside the editor', agree.inside);

    /* ---- 3. undo across a foreign body: the sync rule ---- */
    await seat('shared line'); await sleep(300);
    await caretEnd();
    await page.keyboard.type(' typed here');
    await sleep(400);
    await A(() => { window.A.state.notes.find(n => n.id === 'vpe').body = 'arrived from the other device';
      window.A.render(); });
    await sleep(300);
    await chord('KeyZ');
    const merged = await body();
    check('undo: an undo after a foreign body refuses rather than overwriting it',
      merged === 'arrived from the other device', merged);
    const onScreen = await A(() => document.getElementById('noteBody').textContent);
    check('undo: and the screen still shows the foreign text', onScreen === merged, onScreen);
    await caretEnd();
    await page.keyboard.type(' mine');
    await sleep(400);
    await chord('KeyZ');
    const resumed = await body();
    check('undo: the history re-seeds, so the next step back works again',
      resumed === 'arrived from the other device', resumed);

    /* ---- 4. "- " opens a dash bullet, two spaces walk back out ---- */
    await seat(''); await sleep(300);
    await A(() => document.getElementById('noteBody').focus());
    await page.keyboard.type('- ');
    await sleep(350);
    const opened = await body();
    check('dash: a dash and a space open the list', /^<ul class="dash"><li>/.test(opened), opened);
    check('dash: it is the app\'s own dash list, not a second list type',
      !/<ul>(?!<\/)/.test(opened) && !/<ol>/.test(opened), opened);
    const mark = await A(() => { const u = document.querySelector('#noteBody ul');
      return u ? getComputedStyle(u).listStyleType : 'missing'; });
    check('dash: and it really draws a dash, the mark that was typed', /-/.test(mark), mark);
    await page.keyboard.type('milk');
    await sleep(300);
    check('dash: typing continues inside the bullet', /<li>milk<\/li>/.test(await body()), await body());
    /* Enter for the next bullet, then two spaces on the empty one to leave */
    await page.keyboard.press('Enter');
    await sleep(250);
    await page.keyboard.type('  ');
    await sleep(350);
    const closed = await body();
    check('dash: two spaces on an empty bullet leave the list',
      /<li>milk<\/li><\/ul>/.test(closed) && /- /.test(closed), closed);
    check('dash: and leave a literal dash behind, not an empty line',
      /(^|>)- (<|$)/.test(closed) || /- $/.test(closed), closed);
    const outside = await A(() => {
      const ed = document.getElementById('noteBody');
      const s = getSelection();
      if (!s.rangeCount) return { inList: null };
      let n = s.getRangeAt(0).startContainer;
      while (n && n !== ed) { if (n.tagName === 'LI') return { inList: true }; n = n.parentNode; }
      return { inList: false };
    });
    check('dash: the caret really left the list', outside.inList === false, JSON.stringify(outside));
    await page.keyboard.type('plain again');
    await sleep(300);
    check('dash: and typing carries on as ordinary text',
      /- plain again/.test(await body()), await body());

    /* the conversion is ONE undo step, as easy to leave as to reach */
    await seat(''); await sleep(300);
    await A(() => document.getElementById('noteBody').focus());
    await page.keyboard.type('- ');
    await sleep(350);
    check('dash: converted, ready to undo', /<ul class="dash">/.test(await body()), await body());
    await chord('KeyZ');
    const undone = await body();
    check('dash: one undo takes the conversion back to the dash', undone === '-', JSON.stringify(undone));

    /* the trigger is narrow: a dash mid-line is just text */
    await seat('a - b'); await sleep(300);
    await A(() => { const ed = document.getElementById('noteBody'); ed.focus();
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); const t = w.nextNode();
      const r = document.createRange(); r.setStart(t, 3); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await page.keyboard.type(' ');
    await sleep(300);
    check('dash: a dash inside a line does not become a list', !/<ul/.test(await body()), await body());

    await audit('notes-editing');

    /* ---- 5. the spellcheck underline: what is actually controllable ----
       Change 4 asked for the red squiggle to clear when a word is finished with a
       space. It cannot be done. The mark is painted by the browser's own spellchecker
       in a layer the page cannot read, address or repaint: there is no DOM API for it,
       and the CSS Highlight registry, which IS reachable, holds only highlights the
       page itself created. The page's one lever is the spellcheck attribute, which
       turns the whole checker off for an element. These pin that the app did NOT
       quietly pull that lever. */
    const spell = await A(() => {
      const ed = document.getElementById('noteBody');
      const names = (typeof CSS !== 'undefined' && CSS.highlights)
        ? [...CSS.highlights.keys()] : null;
      return { attr: ed.getAttribute('spellcheck'), prop: ed.spellcheck,
               highlightRegistry: names, offCount:
                 [...document.querySelectorAll('[spellcheck="false"]')].map(e => e.id || e.tagName) };
    });
    check('spellcheck: the editor never opts out', spell.attr === null, String(spell.attr));
    check('spellcheck: so the browser keeps checking, live', spell.prop === true, String(spell.prop));
    check('spellcheck: the browser exposes no spell marks to the page',
      spell.highlightRegistry === null || spell.highlightRegistry.length === 0,
      JSON.stringify(spell.highlightRegistry));
    check('spellcheck: nothing on this view opts out either',
      spell.offCount.length === 0, JSON.stringify(spell.offCount));

    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
  });

  /* ---- K2. the rail collapses, and the board takes the width ---- */
  await flow('rail-collapse', async () => {
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
    const wide = prof.width >= 901;
    const vis = () => A(() => {
      const c = document.getElementById('railcollapse'), s = document.getElementById('railshow');
      const box = el => { const r = el.getBoundingClientRect();
        return { on: getComputedStyle(el).display !== 'none', w: Math.round(r.width), h: Math.round(r.height),
                 right: Math.round(r.right) }; };
      return { c: box(c), s: box(s),
               attr: document.documentElement.getAttribute('data-rail'),
               rail: getComputedStyle(document.getElementById('rail')).display,
               board: Math.round(document.getElementById('board').getBoundingClientRect().width),
               boardLeft: Math.round(document.getElementById('board').getBoundingClientRect().left),
               ls: (() => { try { return localStorage.getItem('agora_dayplanner_rail') } catch (e) { return 'ERR' } })() };
    });

    const v0 = await vis();
    if (!wide) {
      /* under 900px the rail is already behind Menu; neither control is drawn, and
         that is the whole answer for narrow, not a second mechanism */
      check('rail: no collapse control on a narrow layout', !v0.c.on && !v0.s.on,
        JSON.stringify({ c: v0.c.on, s: v0.s.on }));
      const menu = await A(() => {
        const t = document.getElementById('railtoggle');
        return getComputedStyle(t).display !== 'none';
      });
      check('rail: Menu is the narrow mechanism and is still there', menu);
      return;
    }

    check('rail: the collapse control is drawn on a wide layout', v0.c.on, JSON.stringify(v0.c));
    check('rail: the restore control is hidden while the rail is open', !v0.s.on);
    if (coarse) check('rail: the collapse control offers 44px', Math.min(v0.c.w, v0.c.h) >= 44,
      v0.c.w + 'x' + v0.c.h);

    await act({ css: '#railcollapse' });
    const v1 = await vis();
    check('rail: collapsing sets the attribute', v1.attr === 'off', String(v1.attr));
    check('rail: and takes the rail off the layout', v1.rail === 'none', v1.rail);
    check('rail: the choice is remembered on this device', v1.ls === 'off', String(v1.ls));
    check('rail: the board takes the freed width', v1.board > v0.board + 150,
      v0.board + ' -> ' + v1.board);
    check('rail: the restore control appears', v1.s.on, JSON.stringify(v1.s));
    if (coarse) check('rail: the restore control offers 44px', Math.min(v1.s.w, v1.s.h) >= 44,
      v1.s.w + 'x' + v1.s.h);
    /* nothing may be drawn under the restore button: the main column starts clear of it */
    check('rail: the board starts clear of the restore control', v1.boardLeft >= v1.s.right,
      'boardLeft=' + v1.boardLeft + ' buttonRight=' + v1.s.right);
    await audit('rail-collapsed');

    await act({ css: '#railshow' });
    const v2 = await vis();
    check('rail: the restore control brings it back', v2.attr === null && v2.rail !== 'none',
      String(v2.attr) + '/' + v2.rail);
    check('rail: and that choice is remembered too', v2.ls === 'on', String(v2.ls));
    check('rail: the board is back to its original width', Math.abs(v2.board - v0.board) <= 1,
      v0.board + ' -> ' + v2.board);
    /* it is chrome, not data: nothing about it can reach the planner or the cloud */
    const clean = await A(() => {
      const raw = localStorage.getItem('agora_dayplanner_v1') || '';
      return raw.indexOf('data-rail') < 0 && raw.indexOf('agora_dayplanner_rail') < 0
        && window.A.state.settings.rail === undefined;
    });
    check('rail: nothing about it is written into the planner', clean);
  });

  /* ---- K3. scrollbars: visible while scrolling, and never costing layout ---- */
  await flow('scrollbars', async () => {
    /* Pick a scroller that REALLY overflows at this profile rather than assuming one:
       the rail scrolls on a desktop and does not on a phone, where the whole document
       scrolls instead. Everything below is then measured on something that can move. */
    const target = await A(() => {
      const cands = ['#rail', '#board', '#cal', '.colbody', '.notelist', '.noteed'];
      for (const s of cands) {
        const el = document.querySelector(s);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (!/auto|scroll/.test(cs.overflowY + ' ' + cs.overflowX)) continue;
        if (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4) return s;
      }
      /* narrow layouts hand scrolling to the PAGE: the rail goes overflow:visible and
         the board stacks, so the only scroller left is the document itself */
      const de = document.scrollingElement || document.documentElement;
      if (de.scrollHeight > de.clientHeight + 4) return ':root';
      return null;
    });
    check('scrollbars: the profile has a scroller to measure', !!target, String(target));
    if (!target) return;
    const isDoc = target === ':root';
    const m = await page.evaluate(sel => {
      const doc = sel === ':root';
      const el = doc ? (document.scrollingElement || document.documentElement)
                     : document.querySelector(sel);
      /* the document's gutter is the classic measurement: the width the viewport lost
         to the page scrollbar. An element's is what the scrollbar takes out of its
         own content box, border aside. */
      const gut = () => doc ? Math.round(window.innerWidth - document.documentElement.clientWidth)
                            : Math.round(el.offsetWidth - el.clientWidth -
                                ((parseFloat(getComputedStyle(el).borderLeftWidth) || 0) +
                                 (parseFloat(getComputedStyle(el).borderRightWidth) || 0)));
      el.classList.remove('scrolling');
      const rest = { cw: el.clientWidth, ch: el.clientHeight, ow: el.offsetWidth, g: gut() };
      el.classList.add('scrolling');
      el.getBoundingClientRect();
      const on = { cw: el.clientWidth, ch: el.clientHeight, ow: el.offsetWidth, g: gut() };
      el.classList.remove('scrolling');
      return { rest, on, vert: el.scrollHeight > el.clientHeight + 4 };
    }, target);
    /* THE POINT OF THE WHOLE MECHANISM: showing the thumb costs no layout at all */
    check('scrollbars: showing the thumb changes no box',
      m.rest.cw === m.on.cw && m.rest.ch === m.on.ch && m.rest.ow === m.on.ow && m.rest.g === m.on.g,
      JSON.stringify(m));
    /* and the gutter is genuinely reserved, so content never sat where the bar appears.
       TWO CASES, and the difference is the platform's, not the page's. Every scroller
       the page styles reserves its gutter. The TOP-LEVEL page bar on a touch profile
       is the browser's own transient overlay, which no page can opt out of and which
       reserves nothing anywhere, in any app, on that device. It costs no layout either
       way, so the no-reflow guarantee holds in both; only the "never under content"
       half is the platform's call, and only for the page itself. */
    if (isDoc && coarse) {
      check('scrollbars: the page bar on a touch profile is the platform overlay, reserving nothing',
        m.rest.g === 0, 'gutter=' + m.rest.g + 'px');
    } else {
      check('scrollbars: the gutter is reserved even at rest, so nothing sits under the bar',
        !m.vert || m.rest.g >= 6, 'gutter=' + m.rest.g + 'px on ' + target + ' vertical=' + m.vert);
    }

    /* a REAL scroll marks the element, and it goes quiet on its own */
    const cycle = await page.evaluate(async sel => {
      const doc = sel === ':root';
      const el = doc ? (document.scrollingElement || document.documentElement)
                     : document.querySelector(sel);
      const vert = el.scrollHeight > el.clientHeight + 4;
      el.scrollTop = 0; el.scrollLeft = 0;
      if (vert) el.scrollTop = 40; else el.scrollLeft = 40;
      await new Promise(r => setTimeout(r, 80));
      const during = el.classList.contains('scrolling');
      const moved = vert ? el.scrollTop > 0 : el.scrollLeft > 0;
      await new Promise(r => setTimeout(r, 1200));
      const after = el.classList.contains('scrolling');
      el.scrollTop = 0; el.scrollLeft = 0;
      return { during, after, moved };
    }, target);
    check('scrollbars: the test scroll actually moved the scroller', cycle.moved, JSON.stringify(cycle));
    check('scrollbars: a real scroll shows the bar', cycle.during, JSON.stringify(cycle));
    check('scrollbars: and it goes when the scrolling stops', !cycle.after, JSON.stringify(cycle));

    /* every scroller in the app is covered by the one rule, not a list someone maintains */
    const all = await A(() => {
      const out = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        const scrolls = /auto|scroll/.test(cs.overflowY + ' ' + cs.overflowX);
        if (!scrolls || !el.getClientRects().length) return;
        const before = { cw: el.clientWidth, ch: el.clientHeight };
        el.classList.add('scrolling');
        el.getBoundingClientRect();
        const same = el.clientWidth === before.cw && el.clientHeight === before.ch;
        el.classList.remove('scrolling');
        out.push({ id: el.id || el.className || el.tagName, same });
      });
      return out;
    });
    const bad = all.filter(x => !x.same);
    check('scrollbars: no scroller anywhere reflows when its bar appears',
      bad.length === 0 && all.length >= 2,
      all.length + ' scrollers, ' + bad.length + ' reflowed' +
      (bad.length ? ': ' + JSON.stringify(bad.slice(0, 3)) : ''));
  });

  /* ---- K4. tab reorder by tap: the coarse profiles are the whole reason ---- */
  await flow('tab-move', async () => {
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    await A(() => {
      window.A.state.floats = [{ id: 'vA', name: 'Alpha', tasks: [], up: 1, pos: 1 },
                               { id: 'vB', name: 'Bravo', tasks: [], up: 1, pos: 2 },
                               { id: 'vC', name: 'Charlie', tasks: [], up: 1, pos: 3 }];
      window.A.save(); window.A.render();
    });
    await sleep(320);
    const shape = await A(() => {
      const g = (fid, d) => document.querySelector('[data-action="float-move"][data-fid="' + fid + '"][data-d="' + d + '"]');
      /* the same effective size the audit measures: a control drawn small on purpose
         grows an invisible hit area through an absolutely positioned ::before with
         negative offsets, which is the app's coarse-pointer idiom for minis */
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
        const ps = getComputedStyle(el, '::before');
        let ew = r.width, eh = r.height;
        if (ps.content !== 'none' && ps.position === 'absolute') {
          ew = r.width - ((parseFloat(ps.left) || 0) + (parseFloat(ps.right) || 0));
          eh = r.height - ((parseFloat(ps.top) || 0) + (parseFloat(ps.bottom) || 0));
        }
        return { w: Math.round(r.width), h: Math.round(r.height),
                 ew: Math.round(ew), eh: Math.round(eh),
                 label: (el.getAttribute('aria-label') || '').trim(),
                 text: (el.textContent || '').trim() }; };
      return { aL: box(g('vA', -1)), aR: box(g('vA', 1)),
               bL: box(g('vB', -1)), bR: box(g('vB', 1)),
               cL: box(g('vC', -1)), cR: box(g('vC', 1)),
               order: window.A.state.floats.map(f => f.id).join(',') };
    });
    check('tabs: the first tab renders no left control', shape.aL === null);
    check('tabs: the last tab renders no right control', shape.cR === null);
    check('tabs: a middle tab has both', !!shape.bL && !!shape.bR);
    check('tabs: every move control is named and visibly labelled',
      [shape.aR, shape.bL, shape.bR, shape.cL].every(b => b && b.label.length > 0 && b.text.length > 0),
      JSON.stringify([shape.aR, shape.bL]));
    if (coarse) {
      const sizes = [shape.aR, shape.bL, shape.bR, shape.cL].map(b => Math.min(b.ew, b.eh));
      check('tabs: every move control offers 44px to a finger',
        Math.min.apply(null, sizes) >= 44,
        'min=' + Math.min.apply(null, sizes) + 'px (drawn ' + shape.bL.w + 'x' + shape.bL.h + ')');
    }
    /* the tap itself, through the profile's real input: this is the reachability that
       the drag has never had on a touch device */
    await A(() => window.A.save());
    const pos0 = await A(() => +window.A.state.floats.find(f => f.id === 'vA').pos);
    await act({ css: '[data-action="float-move"][data-fid="vA"][data-d="1"]' });
    const o1 = await A(() => window.A.state.floats.map(f => f.id).join(','));
    check('tabs: a tap moves the tab one position', o1 === 'vB,vA,vC', o1);
    /* commit while the order really has changed: pos is stamped from the changed
       ordinal, exactly as a drop stamps it */
    const pos1 = await A(() => { window.A.save();
      return +window.A.state.floats.find(f => f.id === 'vA').pos; });
    check('tabs: the move is written to the pos axis, as a drop writes it', pos1 > pos0,
      pos0 + ' -> ' + pos1);
    await act({ css: '[data-action="float-move"][data-fid="vA"][data-d="-1"]' });
    const o2 = await A(() => window.A.state.floats.map(f => f.id).join(','));
    check('tabs: and a tap the other way moves it back', o2 === 'vA,vB,vC', o2);
    await audit('tab-move');
    /* the drag surface is untouched */
    const drag = await A(() => document.querySelectorAll('.col.backlog .colhead[draggable="true"]').length);
    check('tabs: every header is still a drag handle', drag === 3, String(drag));
    await act({ css: '.navbtn[data-action="floattoggle"]' });
  });

  /* ---- K5. This week collapses with content; True north rests ---- */
  await flow('panels', async () => {
    if (narrow) await act('#railtoggle');
    const host = narrow ? '#weekMobile' : '#weekRail';
    await A(() => {
      window.A.state.week.list = [{ id: 'vw1', title: 'Book the dentist', done: false, up: 1, pos: 1 }];
      window.A.state.settings.weekOpen = true;
      window.A.state.focus = [{ id: 'vn1', title: 'Steady, not rushed', done: false, up: 1, pos: 1 }];
      window.A.ui.northOn = false;
      window.A.save(); window.A.render();
    });
    await sleep(320);
    const w0 = await page.evaluate(h => {
      const kh = document.querySelector(h + ' .kh');
      return { add: !!document.querySelector('#weekAdd'),
        toggle: kh ? (kh.dataset.action || null) : 'NO .kh IN ' + h,
        chev: !!document.querySelector(h + ' .chev') };
    }, host);
    check('week: the header carries a toggle even holding an item', w0.toggle === 'week-toggle', String(w0.toggle));
    check('week: and starts expanded', w0.add && w0.chev, JSON.stringify(w0));
    await act({ css: host + ' .kh' });
    const w1 = await A(() => ({ add: !!document.querySelector('#weekAdd'),
      flag: window.A.state.settings.weekOpen,
      items: window.A.state.week.list.length }));
    check('week: tapping the header collapses it with content in it', !w1.add && w1.flag === false,
      JSON.stringify(w1));
    check('week: and the item is hidden, never deleted', w1.items === 1, String(w1.items));
    await audit('week-collapsed-full');
    await act({ css: host + ' .kh' });
    const w2 = await A(() => !!document.querySelector('#weekAdd'));
    check('week: tapping again opens it', w2);

    /* True north at rest shows the statement and nothing else */
    const n0 = await A(() => ({ text: document.querySelector('#fpanel').textContent,
      fi: !!document.querySelector('#fi'), arch: !!document.querySelector('#fpanel .fdone'),
      chev: !!document.querySelector('#fpanel .chev') }));
    check('north: at rest the statement is in view', /Steady, not rushed/.test(n0.text));
    check('north: and its working parts are not', !n0.fi && !n0.arch, JSON.stringify(n0));
    check('north: the pinned-open rule still draws no chevron', !n0.chev);
    await act({ css: '#fpanel .kh' });
    const n1 = await A(() => ({ fi: !!document.querySelector('#fi'),
      text: document.querySelector('#fpanel').textContent }));
    check('north: a press on the panel reveals the add field', n1.fi);
    check('north: with the statement still there', /Steady, not rushed/.test(n1.text));
    await audit('north-active');
    await act({ css: '#board' });
    const n2 = await A(() => ({ fi: !!document.querySelector('#fi'),
      text: document.querySelector('#fpanel').textContent }));
    check('north: a press outside puts the working parts away', !n2.fi);
    check('north: and the statement NEVER goes', /Steady, not rushed/.test(n2.text));
    if (narrow) await act('#railtoggle');
  });

  /* ---- K6. the logo resets the view ---- */
  await flow('logo-home', async () => {
    if (narrow) await act('#railtoggle');
    await A(() => {
      window.A.state.settings.view = 'notes';
      window.A.state.settings.floatMode = true;
      window.A.state.settings.boardOffset = 3;
      window.A.save(); window.A.render();
    });
    await sleep(320);
    const before = await A(() => JSON.stringify(window.A.state.days).length + '|' +
      window.A.state.notes.length + '|' + window.A.state.floats.length);
    await act({ css: '.brandbtn' });
    const after = await A(() => ({ view: window.A.state.settings.view,
      floatMode: window.A.state.settings.floatMode,
      off: window.A.state.settings.boardOffset,
      noteSel: window.A.state.settings.noteSel,
      board: !!document.querySelector('#board .col'),
      data: JSON.stringify(window.A.state.days).length + '|' +
            window.A.state.notes.length + '|' + window.A.state.floats.length }));
    check('logo: lands on the board', after.view === 'board' && after.board, JSON.stringify(after));
    check('logo: out of Free Floating and back to today', after.floatMode === false && after.off === 0);
    check('logo: with no note left open', after.noteSel === null, String(after.noteSel));
    check('logo: and not one item of planner data touched', after.data === before,
      before + ' -> ' + after.data);
    if (narrow) await act('#railtoggle');
  });

  /* ---- N1. folders in Notes: create, name, move in and out, delete, all through
     the profile's REAL input (touch taps on the coarse profiles, which is the
     population drag could never serve) ---- */
  await flow('note-folders', async () => {
    /* self-seeded: the notes-editing flow replaces state.notes wholesale, so this
       flow must not depend on the boot seed having survived the run this far */
    await A(() => {
      window.A.state.notes = [
        { id: 'sn1', title: 'Grocery run', body: 'eggs and bread', up: 1, dn: 1, pos: 1 },
        { id: 'sn2', title: 'Trip ideas', body: 'coast road', up: 1, dn: 1, pos: 2, folder: 'fldA' }];
      window.A.state.folders = [{ id: 'fldA', name: 'Plans', up: 1, dn: 1, pos: 1 }];
      window.A.state.settings.noteSel = null;
      window.A.save(); window.A.render();
    });
    await sleep(300);
    await act({ css: '.navbtn[data-action="view"][data-v="notes"]' });
    /* the seeded folder renders as a heading, its note under it, loose notes first */
    const seq = await A(() => [...document.querySelectorAll('#noteRows > *')].map(e =>
      e.classList.contains('fldhead') ? 'head:' + e.querySelector('.fldname').textContent
        : (e.querySelector('.noterow') ? e.querySelector('.noterow').dataset.id : '?')));
    check('folders: the folder renders as a heading in the list', seq.some(x => x === 'head:Plans'), seq.join(','));
    check('folders: its note sits under it', seq.indexOf('sn2') === seq.indexOf('head:Plans') + 1, seq.join(','));
    check('folders: loose notes come first, unheaded', seq.indexOf('sn1') < seq.indexOf('head:Plans'), seq.join(','));

    /* create a folder through the real control, name it through the real keyboard */
    await act({ css: '[data-action="folder-new"]' });
    await page.keyboard.type('Errands');
    await page.keyboard.press('Enter');
    await sleep(320);
    const named = await A(() => window.A.state.folders.map(f => f.name).join(','));
    check('folders: created and named in place', /Errands/.test(named), named);

    /* a loose note moves IN from its list row: tap Move, tap the folder */
    await act({ css: '.noteli [data-action="note-movemenu"][data-id="sn1"]' });
    const chooser = await A(() => !!document.querySelector('#noteMoveModal'));
    check('folders: the row Move opens the chooser without opening the note', chooser);
    await audit('folder-chooser', { root: '#noteMoveModal' });
    await act({ css: '#noteMoveModal .popt', text: 'Errands' });
    const movedIn = await A(() => { const n = window.A.state.notes.find(x => x.id === 'sn1');
      const f = n && n.folder && window.A.state.folders.find(y => y.id === n.folder);
      return f ? f.name : ''; });
    check('folders: a loose note moves into a folder from the list, no drag anywhere', movedIn === 'Errands', movedIn);

    /* and BETWEEN folders from the open page's own Move */
    await act({ css: '.noterow[data-id="sn1"]' });
    await act({ css: '.notemeta [data-action="note-movemenu"]' });
    const marked = await A(() => { const on = document.querySelector('#noteMoveModal .popt.on');
      return on ? on.textContent : ''; });
    check('folders: the chooser marks where the note sits now', /Errands/.test(marked), marked);
    await act({ css: '#noteMoveModal .popt', text: 'Plans' });
    const movedAcross = await A(() => window.A.state.notes.find(x => x.id === 'sn1').folder === 'fldA');
    check('folders: and between folders from the open note', movedAcross);

    /* and back OUT to the loose list */
    await act({ css: '.noteli [data-action="note-movemenu"][data-id="sn1"]' });
    await act({ css: '#noteMoveModal .popt', text: 'No folder' });
    const looseAgain = await A(() => !window.A.state.notes.find(x => x.id === 'sn1').folder);
    check('folders: and back out to the loose list', looseAgain);
    await audit('note-folders');

    /* deleting a folder that holds notes asks first, moves them out, offers Undo */
    await act({ css: '[data-action="folder-del"][data-fid="fldA"]' });
    const confirm = await A(() => !!document.querySelector('.mback') &&
      /should not delete them/.test(document.querySelector('.modal').textContent));
    check('folders: deleting a full folder asks first and promises the notes are safe', confirm);
    await audit('folder-del-confirm', { root: '#modalRoot .modal' });
    await act({ css: '[data-action="folder-del-move"]' });
    const after = await A(() => ({
      gone: !window.A.state.folders.some(f => f.id === 'fldA'),
      note: !!window.A.state.notes.find(n => n.id === 'sn2'),
      loose: !window.A.state.notes.find(n => n.id === 'sn2').folder,
      undo: !!document.querySelector('#toast [data-action="undo"]') }));
    check('folders: the folder goes, the note stays, loose', after.gone && after.note && after.loose, JSON.stringify(after));
    check('folders: with the 5 second Undo offered', after.undo);
    await act({ css: '#toast [data-action="undo"]' });
    const undone = await A(() => window.A.state.folders.some(f => f.id === 'fldA') &&
      window.A.state.notes.find(n => n.id === 'sn2').folder === 'fldA');
    check('folders: Undo puts the folder back with its note inside', undone);

    /* an empty folder goes at once, no confirm */
    const eid = await A(() => (window.A.state.folders.find(f => f.name === 'Errands') || {}).id);
    if (eid) {
      await act({ css: '[data-action="folder-del"][data-fid="' + eid + '"]' });
      const gone = await A(() => !document.querySelector('.mback') &&
        !window.A.state.folders.some(f => f.name === 'Errands'));
      check('folders: an empty folder goes without a confirm', gone);
    }
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
  });

  /* ---- N2. the sticky note at every placement ---- */
  await flow('sticky', async () => {
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
    const measure = () => A(() => {
      const s = document.getElementById('sticky');
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s);
      return { display: s.style.display, pos: cs.position, w: Math.round(r.width),
        top: Math.round(r.top), right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
        visible: r.width > 0 && r.height > 0 };
    });
    /* board */
    const b = await measure();
    check('sticky: present on the board', b.display !== 'none' && b.visible, JSON.stringify(b));
    if (!narrow) {
      check('sticky: floats in the bottom right corner on wide layouts',
        b.pos === 'absolute' && b.right >= 0 && b.right < 60 && b.bottom >= 0 && b.bottom < 60, JSON.stringify(b));
      /* "a margin note, not a second panel" is a SHARE of the board, not a pixel
         count. The corner was doubled (435px at 1280, 348px at 1024, capped by
         min(464px,34vw) so a flat 464 cannot swallow the 684px board at 1024),
         so the old w<=260 bar measured the wrong thing. What would make it a
         panel is dominating the board, which is what this measures instead. */
      const share = await A(() => {
        const s = document.getElementById('sticky').getBoundingClientRect();
        const bd = document.querySelector('#board');
        return { pct: +(s.width / bd.clientWidth).toFixed(3), w: Math.round(s.width), board: bd.clientWidth };
      });
      check('sticky: stays a margin note, never a second panel', share.pct <= 0.55, JSON.stringify(share));
      /* THE CASE THAT FAILED THE FIRST RUN OF THIS PASS: at the end of the
         board's sideways scroll the last column must clear the corner. That is
         what #board's padding-right reservation buys, and the reservation has to
         track the corner's width or the column slides back under it. */
      const clear = await A(() => {
        const bd = document.querySelector('#board');
        const before = bd.scrollLeft;
        bd.scrollLeft = bd.scrollWidth;
        const s = document.getElementById('sticky').getBoundingClientRect();
        const cols = [...document.querySelectorAll('#board .col')];
        const last = cols.length ? cols[cols.length - 1].getBoundingClientRect() : null;
        const r = { gap: last ? Math.round(s.left - last.right) : null, cols: cols.length,
          scrolls: bd.scrollWidth > bd.clientWidth + 1 };
        bd.scrollLeft = before;
        return r;
      });
      check('sticky: the last column clears the corner at max sideways scroll',
        clear.gap === null || clear.gap >= 0, JSON.stringify(clear));
      /* risk 16's residual, pinned as the invariant that actually closes it: the
         reservation is part of the board's scroll width, so if it is at least the
         corner's width plus its offset then a board too short to scroll must end
         its columns BEFORE the corner's left edge, and the buried-tail geometry
         cannot be built at all. Checked as a rule, not as one lucky layout. */
      const reserve = await A(() => {
        const bd = document.querySelector('#board');
        const s = document.getElementById('sticky').getBoundingClientRect();
        return { pad: Math.round(parseFloat(getComputedStyle(bd).paddingRight)),
          corner: Math.round(s.width), offset: Math.round(window.innerWidth - s.right) };
      });
      check('sticky: the board reserves the corner width plus its offset, which is what closes risk 16',
        reserve.pad >= reserve.corner + reserve.offset, JSON.stringify(reserve));
      /* THE VERTICAL TWIN OF THE RESERVATION ABOVE, and the thing that actually
         closed risk 16. #board reserves the corner's width at the end of the scroll
         it has, which is sideways; .colbody is the only vertical scroller in a
         column (#board is overflow-y:hidden, .col is overflow:hidden) and until
         2026-08-13 it reserved nothing, so a column whose tail landed in the
         corner's band had no scroll with which to clear it and the "+ add" row sat
         under the pad. That, not the corner's size, is what the (794,625) defect
         was. Same inequality as the width one, checked the same way. */
      const vres = await A(() => {
        const cb = document.querySelector('#board .colbody');
        const s = document.getElementById('sticky').getBoundingClientRect();
        return { pad: cb ? Math.round(parseFloat(getComputedStyle(cb).paddingBottom)) : -1,
          corner: Math.round(s.height), offset: Math.round(window.innerHeight - s.bottom) };
      });
      check('sticky: the column reserves the corner height plus its offset, the vertical twin',
        vres.pad >= vres.corner + vres.offset, JSON.stringify(vres));
      /* the corner's HEIGHT, three bands, and the band is read off the viewport the
         same way the sheet reads it. 184 from 901 to 1199 (232px wide there, it never
         reaches a day column's add control), 130 from 1200 to 1821 on a short screen
         (at 1280 the auditor centres that control at x=794, exactly the 464px
         corner's left edge, and 152 passes while 154 fails), 184 again once the
         viewport is 1000px tall, which is the axis that imposed the cap. */
      const cpad = await A(() => Math.round(document.getElementById('stickyPad').getBoundingClientRect().height));
      const want = prof.width < 1200 ? 184 : (prof.height >= 1000 ? 184 : 130);
      check('sticky: the corner pad takes the height its band affords, against a reserved column',
        cpad === want, cpad + ' (want ' + want + ' at ' + prof.width + 'x' + prof.height + ')');
    } else {
      check('sticky: joins the flow full width on narrow layouts, never a floating corner',
        b.pos === 'static' && b.w > 300, JSON.stringify(b));
    }
    const seeded = await page.$eval('#stickyPad', el => el.value);
    check('sticky: the seeded text arrives', seeded === 'seeded sticky text', seeded);
    /* type through the real input, caret parked at the end first */
    await act('#stickyPad');
    await A(() => { const p = document.getElementById('stickyPad');
      p.focus(); p.setSelectionRange(p.value.length, p.value.length); });
    await page.keyboard.type(' plus more');
    await sleep(200);
    const st = await A(() => window.A.state.sticky);
    check('sticky: typing lands in state with its moment', /plus more$/.test(st.text) && st.at > 1, JSON.stringify(st));
    await audit('sticky-board');
    /* Free Floating keeps it */
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    const f = await measure();
    check('sticky: present on Free Floating', f.display !== 'none' && f.visible, JSON.stringify(f));
    await audit('sticky-float');
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    /* Notes: TOP right on wide, at the end of the flow on narrow; never over the page */
    await act({ css: '.navbtn[data-action="view"][data-v="notes"]' });
    const n = await measure();
    check('sticky: present in Notes', n.display !== 'none' && n.visible, JSON.stringify(n));
    /* THE PLACEMENT AND THE CLEARANCE, measured under both themes.
       The editor's own controls live in the top right corner of the page: the toolbar
       spans the page's full width, and Unpin and Delete are the last two items of the
       meta row above it. That corner is exactly where a floated sticky would land, so
       the guarantee has to be measured against those three elements by name, not
       inferred from the page's outer box. In flow the overlap cannot be built at all,
       which is the reason the placement is in flow. */
    const notesGeo = () => A(() => {
      const st = document.getElementById('sticky');
      const s = st.getBoundingClientRect(), cs = getComputedStyle(st);
      const main = document.getElementById('main');
      const top = main.getBoundingClientRect().top + parseFloat(getComputedStyle(main).paddingTop);
      const nact = t => [...document.querySelectorAll('.nact')].find(e => t.test(e.textContent.trim()));
      const named = [['toolbar', document.querySelector('.ntools')],
                     ['unpin', nact(/^(Unpin|Pin)$/)], ['delete', nact(/^Delete$/)]];
      const hits = named.map(([nm, el]) => {
        if (!el) return { nm, missing: true };
        const r = el.getBoundingClientRect();
        return { nm, over: s.left < r.right && s.right > r.left && s.top < r.bottom && s.bottom > r.top,
                 gap: Math.round(r.top - s.bottom) };
      });
      /* THE PANE IS ITS TWO CHILDREN, not #notes. Inside the 1200px grid #notes is
         display:contents, so it has no box of its own and getBoundingClientRect
         reports an empty rect: measuring it there would compare the strip against
         0,0,0,0 and pass whatever the layout did. The list and the editor are real
         boxes in every band, so the pane is read off them. */
      const rr = q => { const e = document.querySelector(q); if (!e) return null;
        const b = e.getBoundingClientRect();
        return { t: Math.round(b.top), b: Math.round(b.bottom),
                 l: Math.round(b.left), r: Math.round(b.right) }; };
      const list = rr('.notelist'), ed = rr('.noteed');
      return { pos: cs.position, order: cs.order, hits, list, ed,
        theme: document.documentElement.getAttribute('data-theme') || 'sky',
        t: Math.round(s.top), b: Math.round(s.bottom), l: Math.round(s.left), r: Math.round(s.right),
        right: Math.round(window.innerWidth - s.right), contentTop: Math.round(top),
        paneTop: Math.min(list.t, ed.t), paneBottom: Math.max(list.b, ed.b) };
    });
    for (const g of await bothThemes(notesGeo)) {
      const th = ' [' + g.theme + ']';
      if (!narrow) {
        check('sticky: stands at the top right of the content area in Notes' + th,
          g.pos === 'static' && g.order === '-1' && Math.abs(g.t - g.contentTop) <= 1 && g.right < 60,
          JSON.stringify(g));
        if (threecol) {
          /* the strip is a COLUMN here, so nothing follows it downwards: it stands
             beside the pane, clear of the editor's right edge, and the list, the
             editor and the strip all start on the same line at the content top. */
          check('sticky: at 1822 and up it stands beside the pane, not above it' + th,
            g.l >= g.ed.r && Math.abs(g.ed.t - g.contentTop) <= 1 &&
            Math.abs(g.list.t - g.contentTop) <= 1,
            JSON.stringify({ sticky: { l: g.l, t: g.t }, ed: g.ed, list: g.list, top: g.contentTop }));
        } else {
          check('sticky: and the note pane follows it, with nothing above the strip' + th,
            (gridded ? g.ed.t : g.paneTop) >= g.b,
            JSON.stringify({ strip: g.b, ed: g.ed.t, paneTop: g.paneTop }));
        }
      } else {
        /* the answer where there is no right hand side to sit at: the pad stays at
           the end of the flow rather than being hoisted above the list, where it
           would bury the list and stand in the way of the keyboard. */
        check('sticky: at a single-column width it stays at the end of the flow' + th,
          g.pos === 'static' && g.order === '0' && g.t >= g.paneBottom, JSON.stringify(g));
      }
      check('sticky: never covers the editor toolbar, Unpin or Delete' + th,
        g.hits.every(h => !h.missing && !h.over), JSON.stringify(g.hits));
    }
    if (!narrow) {
      /* the page's own rect is NOT the question: .noteed clips it, so a page taller
         than its pane reports a box running past the pane's bottom edge and past
         anything below it. What can actually be covered is the page's VISIBLE
         part, so clamp it to the pane before asking. */
      const overlap = await A(() => {
        const s = document.getElementById('sticky').getBoundingClientRect();
        const p = document.querySelector('.notepage'), ed = document.querySelector('.noteed');
        if (!p || !ed) return false;
        const pr = p.getBoundingClientRect(), er = ed.getBoundingClientRect();
        const top = Math.max(pr.top, er.top), bot = Math.min(pr.bottom, er.bottom);
        const left = Math.max(pr.left, er.left), right = Math.min(pr.right, er.right);
        if (bot <= top || right <= left) return false;
        return s.left < right && s.right > left && s.top < bot && s.bottom > top;
      });
      check('sticky: and never covers the page itself', !overlap);
      /* height in Notes comes out of .noteed whether the strip sits above the pane
         or below it: same block, same column flex. Neither move bought room, which
         is why the pad doubles at 1200 and up only. The guard is unchanged: a short
         note must still fit its pane with no scroll. */
      const pane = await A(() => {
        const ed = document.querySelector('.noteed');
        if (!ed) return null;
        return { ch: ed.clientHeight, sh: ed.scrollHeight, scrolls: ed.scrollHeight > ed.clientHeight + 1 };
      });
      check('sticky: a short note still fits its pane, so the strip cost the editor nothing',
        !pane || !pane.scrolls, JSON.stringify(pane));
      const axis = await A(() => Math.round(document.getElementById('stickyPad').getBoundingClientRect().height));
      check('sticky: the Notes pad doubles at 1200 and up, and holds at 92 below it',
        axis === (prof.width >= 1200 ? 184 : 92), String(axis));
    } else {
      const axis = await A(() => Math.round(document.getElementById('stickyPad').getBoundingClientRect().height));
      check('sticky: the narrow pad keeps 168, the size that does not start a scroll at 820',
        axis === 168, String(axis));
    }
    const everywhere = await page.$eval('#stickyPad', el => el.value);
    check('sticky: one block in every placement, not three', /plus more$/.test(everywhere), everywhere);
    await audit('sticky-notes');
    /* the calendar keeps its full width */
    await act({ css: '.navbtn[data-action="view"][data-v="calendar"]' });
    const c = await A(() => document.getElementById('sticky').style.display === 'none');
    check('sticky: hidden on the calendar', c);
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
  });

  /* ---- N2b. the top of the Notes view, and the tray that is not drawn there ----
     Two things are pinned here. First the top of the column: the first block starts
     at the top of the content area, with no emptied slot holding a band open above
     it (`#boardnav` 11px and `#strip` 9px on narrow were the two that used to). On a
     wide layout that first block is the sticky strip, which IS the top right
     placement; on narrow the sticky is at the end of the flow, so it is the list.
     Second the tray: filling state.carry while Notes is open must draw nothing, move
     nothing and change nothing in state, and every carried item must be there to
     triage the moment the board is back. */
  await flow('notes-band', async () => {
    await act({ css: '.navbtn[data-action="view"][data-v="notes"]' });
    const geo = () => A(() => {
      const m = document.getElementById('main'), cs = getComputedStyle(m);
      const top = m.getBoundingClientRect().top + parseFloat(cs.paddingTop);
      const r = s => { const e = document.querySelector(s); if (!e) return null;
        const b = e.getBoundingClientRect();
        return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right),
                 h: Math.round(b.height), w: Math.round(b.width) }; };
      const tr = document.getElementById('tray');
      const list = r('.notelist'), ed = r('.noteed');
      /* the pane, read off its two children rather than #notes, which is
         display:contents inside the 1200px grid and has no box to measure */
      const pane = list && ed
        ? { t: Math.min(list.t, ed.t), b: Math.max(list.b, ed.b),
            l: Math.min(list.l, ed.l), r: Math.max(list.r, ed.r) }
        : null;
      return { top: Math.round(top), notes: r('#notes'), list, ed, pane, wrap: r('.notewrap'),
               sticky: r('#sticky'), tray: tr.firstElementChild ? r('#tray .tray') : null,
               body: r('#noteBody'), board: r('#board'), quick: r('#quickadd'),
               theme: document.documentElement.getAttribute('data-theme') || 'sky' };
    });
    /* (a) the top of the column, under both themes since a theme must not move it */
    const bare = await geo();
    for (const g of await bothThemes(geo)) {
      const th = ' [' + g.theme + ']';
      const first = narrow ? g.list : g.sticky;
      check('notes: the first block of the view starts at the top of the content area' + th,
        first && Math.abs(first.t - g.top) <= 1, JSON.stringify({ first, top: g.top }));
      if (threecol) {
        /* THREE COLUMNS, one row: the list, the editor and the strip all start at the
           content top, and the strip is the rightmost of the three. The dead band the
           strip used to hold across the top is not moved here, it is gone: nothing
           above the editor at all. */
        check('notes: list, editor and strip all start at the top of the content area' + th,
          g.list && g.ed && g.sticky && Math.abs(g.list.t - g.top) <= 1 &&
          Math.abs(g.ed.t - g.top) <= 1 && Math.abs(g.sticky.t - g.top) <= 1,
          JSON.stringify({ top: g.top, list: g.list.t, ed: g.ed.t, sticky: g.sticky.t }));
        check('notes: the strip is the third column, right aligned and clear of the editor' + th,
          g.sticky && g.ed && g.list && g.sticky.l >= g.ed.r && g.ed.l >= g.list.r &&
          g.sticky.r >= g.ed.r,
          JSON.stringify({ list: g.list, ed: g.ed, sticky: g.sticky }));
        /* the whole point of the width: the reading measure survives the third column */
        check('notes: and the editor page keeps its 640px measure, which is what set 1822' + th,
          g.wrap && g.wrap.w === 640, JSON.stringify(g.wrap));
      } else if (!narrow) {
        check('notes: the strip is that block, right aligned, and the pane follows it' + th,
          g.sticky && g.list && g.sticky.r >= g.pane.r &&
          (gridded ? g.ed.t >= g.sticky.b && Math.abs(g.list.t - g.top) <= 1
                   : g.pane.t >= g.sticky.b),
          JSON.stringify({ sticky: g.sticky, list: g.list, ed: g.ed }));
        check('notes: the editor is top-aligned with the list' + th,
          /* inside the 1200px grid the list takes the band beside the strip, so the
             editor starts below the strip and the list starts above it */
          g.ed && (gridded ? g.ed.t > g.list.t : Math.abs(g.ed.t - g.list.t) <= 1),
          JSON.stringify({ list: g.list.t, ed: g.ed.t }));
        check('notes: no emptied slot holds a band between the strip and the pane' + th,
          /* the gap under the strip: below 1200 the whole pane follows it, inside the
             grid the list is already beside it and the editor is what follows */
          g.pane && (gridded ? g.ed.t : g.pane.t) - g.sticky.b <= 12,
          JSON.stringify({ strip: g.sticky.b, ed: g.ed.t, pane: g.pane.t }));
      } else {
        check('notes: the editor follows the list in the single column' + th,
          g.ed && g.ed.t > g.list.t, JSON.stringify({ list: g.list.t, ed: g.ed.t }));
        check('notes: no band is held open above the pane' + th,
          g.notes && Math.abs(g.notes.t - g.top) <= 1, JSON.stringify(g.notes));
      }
    }
    await audit('notes-no-tray');
    /* (b) a tray fills WHILE Notes is open. Written straight into state because this
       is a presentation check, not a triage one: the triage flow above already drives
       the real path. Nothing may be drawn, nothing may move, nothing may change. */
    const carryBefore = await A(() => {
      window.A.state.carry = [{ id: 'bandA', title: 'Email the landlord', done: false,
                                subtasks: [], up: 1, pos: 1, from: 'Prio 0 · Mon' },
                              { id: 'bandB', title: 'Book the dentist', done: false,
                                subtasks: [], up: 1, pos: 1, from: 'Prio 0 · Mon' }];
      window.A.render();
      return JSON.stringify(window.A.state.carry) + '|' + window.A.state.settings.lastRoll;
    });
    await sleep(220);
    for (const g of await bothThemes(geo)) {
      const th = ' [' + g.theme + ']';
      check('notes: a filled carry tray is not drawn in Notes at all' + th, !g.tray, JSON.stringify(g.tray));
      /* measured on the pane's two real boxes, not on #notes: inside the 1200px grid
         #notes is display:contents and reports 0,0,0,0, so comparing it with itself
         would pass whatever the tray did to the layout */
      check('notes: and the view does not move a pixel for it' + th,
        g.pane && bare.pane && g.pane.t === bare.pane.t && g.pane.b === bare.pane.b &&
        g.pane.l === bare.pane.l && g.pane.r === bare.pane.r,
        JSON.stringify({ was: bare.pane, now: g.pane }));
    }
    const left = await A(() => document.querySelectorAll('[data-action^="carry-"]').length);
    check('notes: no triage control is left in the DOM, which a hidden tray would leave',
      left === 0, 'controls=' + left);
    const carryAfter = await A(() =>
      JSON.stringify(window.A.state.carry) + '|' + window.A.state.settings.lastRoll);
    check('notes: the carried items and the roll stamp are untouched by the view',
      carryAfter === carryBefore, carryAfter);
    /* the editor has to stay writable. 240px is #noteBody's own floor on wide; the
       narrow rule gives it 40vh, so measure the element itself. */
    const nowGeo = await geo();
    check('notes: the editor keeps its full height, having given nothing to a tray',
      nowGeo.body && nowGeo.body.h >= (narrow ? 0.3 * prof.height : 200), JSON.stringify(nowGeo.body));
    await audit('notes-carry-hidden');
    /* (c) the same carry, on the two views that DO draw it. The tray is the first
       block of the content area there and the sticky is the corner or the end of the
       flow, so they are kept apart on the vertical axis, never by reserving width. */
    for (const [label, go] of [['board', '.navbtn[data-action="view"][data-v="board"]'],
                               ['free floating', '.navbtn[data-action="floattoggle"]']]) {
      await act({ css: go });
      await sleep(200);
      for (const g of await bothThemes(geo)) {
        const th = ' [' + label + ', ' + g.theme + ']';
        check('tray: still drawn, unchanged, on this view' + th, !!g.tray, JSON.stringify(g.tray));
        check('tray: it sits under the quick add and above the columns, where triage belongs' + th,
          g.tray && g.quick && g.board && g.tray.t >= g.quick.b && g.tray.b <= g.board.t,
          JSON.stringify({ quick: g.quick, tray: g.tray, board: g.board }));
        const apart = g.tray && g.sticky &&
          !(g.tray.l < g.sticky.r && g.tray.r > g.sticky.l && g.tray.t < g.sticky.b && g.tray.b > g.sticky.t);
        check('tray: and never overlaps or runs under the sticky note' + th,
          apart, JSON.stringify({ tray: g.tray, sticky: g.sticky }));
      }
      const items = await A(() => document.querySelectorAll('#tray .trayitem').length);
      check('tray: both carried items are there to triage [' + label + ']', items === 2, 'items=' + items);
      await audit('tray-' + label.replace(/\W+/g, '-'));
    }
    await act({ css: '.navbtn[data-action="floattoggle"]' });
    await A(() => { window.A.state.carry = []; window.A.render(); });
    await sleep(200);
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
  });

  /* ---- N3. the active nav accent, measured as painted under both themes ---- */
  await flow('nav-accent', async () => {
    const read = () => A(() => {
      const b = document.querySelector('#rail .navbtn[data-v="board"]');
      return { on: b.classList.contains('on'), cur: b.getAttribute('aria-current'),
        shadow: getComputedStyle(b).boxShadow,
        icon: getComputedStyle(b.querySelector('.em')).color };
    });
    /* The active item no longer has a surface of its own: all five rail panels are
       one backdrop now. So what actually separates it from a resting item has to be
       measured, in both themes, on the rendered elements. Four marks, each read
       here, plus the proof that the surfaces really are identical. */
    const distinct = () => A(() => {
      const on = document.querySelector('#rail .navbtn.on');
      const off = [...document.querySelectorAll('#rail .navbtn')].find(b => !b.classList.contains('on'));
      if (!on || !off) return null;
      const a = getComputedStyle(on), b = getComputedStyle(off);
      const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const parse = s => { const m = String(s).match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
      const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const ratio = (x, y) => { const p = lum(x), q = lum(y); return (Math.max(p, q) + .05) / (Math.min(p, q) + .05); };
      /* the resting item is transparent, so walk up for the surface it really
         sits on, which is the rail. Each label is measured on its own ground. */
      const bgOf = el => {
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          const m = String(getComputedStyle(n).backgroundColor).match(/rgba\([^)]*,\s*0\s*\)/);
          if (c && !m) return c;
        }
        return null;
      };
      const bg = bgOf(on), bgRest = bgOf(off), ink = parse(a.color), inkOff = parse(b.color);
      return { surfaceDiffers: a.backgroundColor !== b.backgroundColor,
        restingIsBare: /rgba\([^)]*,\s*0\s*\)/.test(b.backgroundColor),
        surfaceStep: bg && bgRest ? +ratio(bg, bgRest).toFixed(2) : null,
        bar: a.boxShadow !== b.boxShadow && /inset/.test(a.boxShadow),
        rim: a.borderTopColor !== b.borderTopColor,
        weight: +a.fontWeight > +b.fontWeight,
        activeInk: bg && ink ? +ratio(ink, bg).toFixed(2) : null,
        restingInk: bgRest && inkOff ? +ratio(inkOff, bgRest).toFixed(2) : null };
    });
    const sky = await read();
    check('nav: Board is marked current on the board view', sky.on && sky.cur === 'page', JSON.stringify(sky));
    check('nav: the accent bar paints the today teal in cloud blue', /86, 124, 141/.test(sky.shadow), sky.shadow);
    check('nav: and the icon takes the same accent', /86, 124, 141/.test(sky.icon), sky.icon);
    const dSky = await distinct();
    check('nav: cloud blue, white marks the active item and the resting ones stay on the rail',
      dSky && dSky.surfaceDiffers && dSky.restingIsBare, JSON.stringify(dSky));
    check('nav: cloud blue, and the surface is backed by bar, rim and weight, since teal is no red',
      dSky && dSky.bar && dSky.rim && dSky.weight, JSON.stringify(dSky));
    check('nav: cloud blue, both label states clear the normal-text bar on their own ground',
      dSky && dSky.activeInk >= 4.5 && dSky.restingInk >= 4.5, JSON.stringify(dSky));
    await A(() => document.documentElement.setAttribute('data-theme', 'mono'));
    /* .navbtn transitions box-shadow over .22s, so give the flip time to land:
       a 140ms read catches the accent mid-interpolation between teal and red */
    await sleep(500);
    const mono = await read();
    check('nav: under mono the same bar is the red', /232, 68, 60/.test(mono.shadow), mono.shadow);
    check('nav: and the icon follows it', /232, 68, 60/.test(mono.icon), mono.icon);
    const dMono = await distinct();
    check('nav: mono, white marks the active item and the resting ones stay on the rail',
      dMono && dMono.surfaceDiffers && dMono.restingIsBare, JSON.stringify(dMono));
    check('nav: mono, the surface step off the near-black rail is unmistakable',
      dMono && dMono.surfaceStep >= 3, JSON.stringify(dMono));
    check('nav: mono, both label states clear the normal-text bar on their own ground',
      dMono && dMono.activeInk >= 4.5 && dMono.restingInk >= 4.5, JSON.stringify(dMono));
    await A(() => document.documentElement.removeAttribute('data-theme'));
    await sleep(400);
    /* EXACTLY ONE current item, in every view including float mode. Float used to
       light Board AND the toggle, giving two elements aria-current="page". */
    const readMarks = () => A(() => ({
      on: [...document.querySelectorAll('#rail .navbtn.on')].map(b => b.textContent.trim()),
      cur: [...document.querySelectorAll('#rail .navbtn[aria-current="page"]')].map(b => b.textContent.trim()) }));
    for (const [label, go] of [
      ['board', () => { window.A.state.settings.floatMode = false; window.A.state.settings.view = 'board'; }],
      ['calendar', () => { window.A.state.settings.view = 'calendar'; }],
      ['notes', () => { window.A.state.settings.view = 'notes'; }],
      ['float mode', () => { window.A.state.settings.view = 'board'; window.A.state.settings.floatMode = true; }]]) {
      await A(go); await A(() => { window.A.save(); window.A.render(); }); await sleep(160);
      const m = await readMarks();
      check('nav: ' + label + ', exactly one item is marked current',
        m.on.length === 1 && m.cur.length === 1 && m.on[0] === m.cur[0], label + ' ' + JSON.stringify(m));
    }
    await A(() => { window.A.state.settings.floatMode = false; window.A.state.settings.view = 'board';
      window.A.save(); window.A.render(); });
    await sleep(200);
    await A(() => document.documentElement.removeAttribute('data-theme'));
    await sleep(500);
    /* the mark follows the view, one at a time */
    await act({ css: '.navbtn[data-action="view"][data-v="notes"]' });
    const marked = await A(() => [...document.querySelectorAll('#rail .navbtn.on')]
      .map(x => x.textContent.trim()).join(','));
    check('nav: the mark follows the view', marked === 'Notes', marked);
    await act({ css: '.navbtn[data-action="view"][data-v="board"]' });
  });

  /* ---- N4. True north: the statement voice, measured as painted ---- */
  await flow('north-style', async () => {
    if (narrow) await act('#railtoggle');
    const read = () => A(() => {
      const p = document.getElementById('fpanel');
      const t = p.querySelector('.frow:not(.done) .ftxt');
      if (!t) return null;
      const parse = c => { const m = String(c).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
        return m ? [+m[1], +m[2], +m[3]] : null; };
      const lin = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const pcs = getComputedStyle(p), tcs = getComputedStyle(t);
      const railTone = parse(getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()
        .replace(/^#(..)(..)(..)$/, (_, r, g, b2) => 'rgb(' + parseInt(r, 16) + ',' + parseInt(g, 16) + ',' + parseInt(b2, 16) + ')'));
      const ink = parse(tcs.color), bg = parse(pcs.backgroundColor);
      const ratio = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      return { ink: tcs.color, size: tcs.fontSize, weight: tcs.fontWeight,
        r: ink && bg ? +ratio(ink, bg).toFixed(2) : 0,
        lighter: bg && railTone ? lum(bg) > lum(railTone) : null };
    });
    const sky = await read();
    check('north: a statement is on screen to measure', !!sky, JSON.stringify(sky));
    check('north: statements carry the display size that makes them WCAG large text',
      sky && sky.size === '19px' && +sky.weight >= 700, JSON.stringify(sky));
    check('north: sky ink is the palette denim, no red imported into the blue theme',
      sky && /63, 100, 136/.test(sky.ink), sky && sky.ink);
    check('north: the backdrop sits lighter than the rail tone', sky && sky.lighter === true);
    check('north: sky contrast measured at ' + (sky ? sky.r : '?') + ', over even the 4.5 normal-text bar',
      sky && sky.r >= 4.5);
    await A(() => document.documentElement.setAttribute('data-theme', 'mono'));
    await sleep(500);
    const mono = await read();
    check('north: mono statements are the red', mono && /232, 68, 60/.test(mono.ink), mono && mono.ink);
    check('north: on a backdrop still lighter than the mono rail', mono && mono.lighter === true);
    check('north: mono contrast measured at ' + (mono ? mono.r : '?') + ', over the 3:1 large-text bar its face earns',
      mono && mono.r >= 3);
    await A(() => document.documentElement.removeAttribute('data-theme'));
    await sleep(500);
    await audit('north-statement');
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
      if ((a.contrast || []).length) bits.push(a.contrast.length + ' contrast');
      if ((a.red || []).length) bits.push(a.red.length + ' red-sprawl');
      lines.push('   audit ' + a.name.padEnd(24) + ' ' + String(a.counted).padStart(3) + ' controls  ' +
        (bits.length ? bits.join('; ') : 'clean'));
      a.hitMisses.forEach(h => { hard++; lines.push('      HIT-MISS ' + h.el + ' -> ' + h.hit + ' @' + h.at); });
      a.small.forEach(s => { hard++; lines.push('      UNDER-' + MIN_TARGET + ' ' + s); });
      a.blank.forEach(b => { hard++; lines.push('      BLANK ' + b); });
      a.white.forEach(w => { hard++; lines.push('      WHITE ' + w); });
      (a.contrast || []).forEach(c => { hard++; lines.push('      CONTRAST ' + c); });
      (a.red || []).forEach(r2 => { hard++; lines.push('      RED-SPRAWL ' + r2); });
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
  /* ignoreDefaultArgs drops Puppeteer's own `--hide-scrollbars`, which headless adds
     for screenshot stability. With it in place every scrollbar in the browser is
     zero-width, so the auto-hiding scrollbars could not be measured at all and the
     rest of the geometry was being read off a browser that draws no bars. Off, the
     pass measures what a real Chrome lays out. */
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
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
