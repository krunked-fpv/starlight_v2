/* Starlight v2 — Offline-First Service Worker (Cache Storage only; never touches localStorage/IndexedDB) */
const CACHE_NAME = 'starlight-v2-cache-2.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './atlases/manifest.json',
  './atlases/terrain-atlas.png',
  './atlases/terrain-normal.png',
  './atlases/terrain-emissive.png',
  './atlases/props-atlas.png',
  './atlases/characters-atlas.png',
  './icons/starlight-icons.svg',
  './icons/starlight-emblem.svg',
];

function resolveAssetUrl(relPath) {
  return new URL(relPath, self.location.href).toString();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS.map(resolveAssetUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('starlight-v2-cache-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const networkPromise = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Stale-while-revalidate: serve immediately from cache and refresh in background
        event.waitUntil(networkPromise);
        return cached;
      }

      const networkResponse = await networkPromise;
      if (networkResponse) return networkResponse;

      if (request.mode === 'navigate') {
        const indexFallback = await cache.match(resolveAssetUrl('./index.html'));
        if (indexFallback) return indexFallback;
      }

      return Response.error();
    }),
  );
});
