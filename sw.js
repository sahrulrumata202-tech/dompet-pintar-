/**
 * DompetPintar — Service Worker
 * @author  @juna rumata | @high.value_
 * @version 1.0
 *
 * Strategi:
 *  - index.html  → Cache-First (offline tetap jalan)
 *  - manifest    → Cache-First
 *  - Font Google → Cache-First (cache sekali, pakai selamanya)
 *  - Lainnya     → Network-First, fallback ke cache
 */

const CACHE_NAME  = 'dompetpintar-v3';
const CACHE_FONTS = 'dompetpintar-fonts-v1';

// File inti yang langsung di-cache saat install
const CORE_ASSETS = [
  './index.html',
  './manifest.json'
];

// Domain font yang boleh di-cache
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

/* ── INSTALL ────────────────────────────────────────────────
   Cache semua file inti. skipWaiting() agar SW langsung aktif
   tanpa nunggu semua tab ditutup.
─────────────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(err => console.warn('[SW] Install cache gagal:', err))
  );
  self.skipWaiting();
});

/* ── ACTIVATE ───────────────────────────────────────────────
   Hapus cache lama yang versinya berbeda, lalu klaim semua
   client agar SW baru langsung berlaku.
─────────────────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  const VALID_CACHES = [CACHE_NAME, CACHE_FONTS];

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !VALID_CACHES.includes(key))
          .map(key => {
            console.log('[SW] Hapus cache lama:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

/* ── FETCH ──────────────────────────────────────────────────
   Routing berdasarkan jenis request:
   1. Font Google  → Cache-First (hemat kuota)
   2. index.html   → Cache-First + update di background
   3. manifest.json→ Cache-First
   4. Lainnya      → Network-First, fallback cache
─────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Abaikan non-GET dan chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // 1. Font Google → Cache-First
  if (FONT_ORIGINS.some(origin => request.url.startsWith(origin))) {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  // 2. File inti (index.html, manifest.json) → Stale-While-Revalidate
  if (
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('manifest.json') ||
    url.pathname === '/' ||
    url.pathname.endsWith('sw.js')
  ) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  // 3. Semua lainnya → Network-First, fallback cache
  event.respondWith(networkFirst(request, CACHE_NAME));
});

/* ── STRATEGI ───────────────────────────────────────────── */

/**
 * Cache-First: ambil dari cache, kalau tidak ada baru fetch.
 * Cocok untuk aset statis seperti font.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || new Response('Offline — aset tidak tersedia.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Stale-While-Revalidate: tampilkan cache dulu (cepat),
 * lalu update cache di background dari network.
 * Cocok untuk HTML utama.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache   = await caches.open(cacheName);
  const cached  = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || await fetchPromise || new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' }
  });
}

/**
 * Network-First: coba network, kalau gagal pakai cache.
 * Cocok untuk request dinamis.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline — konten tidak tersedia.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/* ── PESAN DARI CLIENT ──────────────────────────────────────
   Tangani pesan dari halaman, misal force-update cache.
─────────────────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    );
  }
});
