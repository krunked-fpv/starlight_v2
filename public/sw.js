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

/**
 * Discovers hashed Vite JS/CSS/modulepreload chunks referenced by index.html
 * so the very first offline reload works cleanly at both '/' and '/starlight_v2/'.
 */
function extractHtmlBundleAssets(html) {
  const discovered = new Set();
  const attrRegex = /(?:src|href)=["'](\.\/assets\/[^"']+)["']/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    if (match[1]) discovered.add(match[1]);
  }
  return Array.from(discovered);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_ASSETS.map(resolveAssetUrl));

      try {
        const indexRes = await cache.match(resolveAssetUrl('./index.html'));
        if (indexRes) {
          const html = await indexRes.clone().text();
          const bundleAssets = extractHtmlBundleAssets(html);
          if (bundleAssets.length > 0) {
            await cache.addAll(bundleAssets.map(resolveAssetUrl));
          }
        }
      } catch {
        // Non-fatal fallback if index.html parse fails in dev environments
      }

      await self.skipWaiting();
    })(),
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
          if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(networkPromise);
        return cached;
      }

      const networkResponse = await networkPromise;
      if (networkResponse) return networkResponse;

      if (request.mode === 'navigate') {
        const indexFallback =
          (await cache.match(resolveAssetUrl('./index.html'))) ||
          (await cache.match(resolveAssetUrl('./')));
        if (indexFallback) return indexFallback;
      }

      return Response.error();
    }),
  );
});
