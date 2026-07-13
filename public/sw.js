/* Fortudo service worker: versioned precache of the app shell.
   Precache list + version are generated (scripts/generate-sw-precache.mjs).
   The stamp line below is rewritten by that script so this file's bytes
   change on every deploy (update detection). */
/* global PRECACHE_VERSION, PRECACHE_URLS */
// precache-version: d43006fff7b0
importScripts('sw-precache.js');

const CACHE_NAME = `fortudo-shell-${PRECACHE_VERSION}`;
const PRECACHED = new Set(PRECACHE_URLS);

self.addEventListener('install', (event) => {
    // cache:'no-cache' bypasses the HTTP cache: Firebase serves unheadered
    // assets with max-age=3600, and filling a NEW versioned cache with
    // hour-stale bodies would mean mixed-version deploys.
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all([
                cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'no-cache' }))),
                // config.js is excluded from the generated precache list (CI
                // rewrites it at deploy, so its content differs per
                // environment) but app.js statically imports it — offline boot
                // dies without it. Seed it here; tolerate failure so a
                // transient fetch error can't brick the install.
                cache.add(new Request('/js/config.js', { cache: 'no-cache' })).catch(() => {})
            ])
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k.startsWith('fortudo-shell-') && k !== CACHE_NAME)
                        .map((k) => caches.delete(k))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return; // passthrough (CouchDB, etc.)

    // CI rewrites config.js at deploy; never serve it stale when online
    // (cache:'no-cache' so the HTTP cache's max-age=3600 can't intervene).
    if (url.pathname === '/js/config.js') {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then((response) => {
                    if (!response.ok) return response;
                    const copy = response.clone();
                    return caches
                        .open(CACHE_NAME)
                        .then((cache) => cache.put(event.request, copy))
                        .catch(() => {})
                        .then(() => response);
                }, () => caches.match(event.request))
        );
        return;
    }

    // Every navigation serves the cached shell. Deliberate consequence: the
    // deployed-but-unprecached layout-mockups.html becomes unreachable for
    // SW-controlled clients — accepted, it's a dev-only mockup page.
    const cacheKey = event.request.mode === 'navigate' ? '/index.html' : url.pathname;
    if (!PRECACHED.has(cacheKey) && event.request.mode !== 'navigate') return;

    event.respondWith(caches.match(cacheKey).then((cached) => cached || fetch(event.request)));
});
