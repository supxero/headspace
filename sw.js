/* Headspace day planner — offline cache.
   BUMP THIS VERSION whenever you upload a new index.html,
   otherwise phones keep serving the old copy from cache. */
const CACHE = 'headspace-v42';
const FILES = ['./','./index.html','./manifest.webmanifest',
               './icon-192.png','./icon-512.png','./icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network first so an update is picked up as soon as you are online,
   falling back to the cache so the app still opens on a plane. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* cloud sync talks to Supabase. Never cache that, and never answer it from the
     cache, or an offline read would come back as the index page instead of data. */
  if (/\.supabase\.co$/.test(new URL(e.request.url).hostname)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
