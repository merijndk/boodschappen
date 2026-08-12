'use strict';

const CACHE = 'boodschappen-v7';
const ASSETS = [
  '.',
  'index.html',
  'app.js',
  'config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Pre-cache so the app still opens offline. Do NOT skipWaiting here — the
  // page decides when to activate a new version (see the message handler).
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

// The page posts this when it detects a newer worker; we activate immediately.
// Replacing the old controller fires 'controllerchange' in the page, which
// then reloads to pick up the new files.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match('index.html');
      if (fallback) return fallback;
    }
    throw new Error('offline and not cached');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache the Supabase API — always hit the network so data is fresh.
  if (url.hostname.endsWith('supabase.co')) return;

  // App shell / code → network-first, so a launch while online always gets the
  // latest version and only falls back to cache when offline.
  const isShell =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    /\.(html|js|webmanifest)$/.test(url.pathname);

  event.respondWith(isShell ? networkFirst(req) : cacheFirst(req));
});
