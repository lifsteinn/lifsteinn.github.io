/* Lífsteinn service worker — cache generation: lifsteinn-v1
   Strategy (as agreed):
   - Navigations: network-first with a 3s timeout, falling back to the cached
     app shell, so deploys show up immediately but offline still works.
   - Google Fonts: stale-while-revalidate in a runtime cache.
   - Same-origin static files (icons, manifest): cache-first.
   - activate deletes every cache that isn't ours, which purges any cache
     left behind by older versions of the app regardless of its name. */

const CACHE = 'lifsteinn-v1';
const RUNTIME = 'lifsteinn-rt-v1';
const SHELL = './index.html';
const PRECACHE = [
  './',
  SHELL,
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Network-first with timeout for the app shell. */
function shellNetworkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;

    const useCache = () => {
      caches.match(SHELL).then((cached) => {
        resolve(cached || new Response('Offline and not yet cached.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        }));
      });
    };

    const timer = setTimeout(() => {
      if (!settled) { settled = true; useCache(); }
    }, 3000);

    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(SHELL, copy));
      }
      if (!settled) {
        settled = true;
        (res && res.ok) ? resolve(res) : useCache();
      }
    }).catch(() => {
      clearTimeout(timer);
      if (!settled) { settled = true; useCache(); }
    });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* App shell */
  if (req.mode === 'navigate') {
    e.respondWith(shellNetworkFirst(req));
    return;
  }

  /* Google Fonts: stale-while-revalidate */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const cached = await c.match(req);
        const fresh = fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  /* Same-origin static assets: cache-first */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
