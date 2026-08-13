/* Lífsteinn service worker — fresh lineage (purges all elder caches on arrival).
   Never caches failures; icons stay network-fresh so new art appears promptly. */
const CACHE = 'lifsteinn-v11';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(['./', './manifest.webmanifest'].map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3500))
    ]);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    const m = await c.match(req) || (req.mode === 'navigate' ? await c.match('./') : null);
    if (m) return m;
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const m = await c.match(req);
  if (m) return m;
  const r = await fetch(req);
  if (r && r.ok) c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.includes('/glyph')) { e.respondWith(cacheFirst(e.request)); return; }
  if (url.origin === location.origin || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(networkFirst(e.request));
  }
});
