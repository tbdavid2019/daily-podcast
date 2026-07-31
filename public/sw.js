const CACHE_NAME = 'daily-podcast-offline-v1'
const OFFLINE_PAGE = '/offline.html'
const PRECACHE_URLS = [
  OFFLINE_PAGE,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

globalThis.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)))
  globalThis.skipWaiting()
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames
        .filter(cacheName => cacheName.startsWith('daily-podcast-') && cacheName !== CACHE_NAME)
        .map(cacheName => caches.delete(cacheName)),
    )),
  )
  globalThis.clients.claim()
})

globalThis.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.mode !== 'navigate')
    return

  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE)))
})
