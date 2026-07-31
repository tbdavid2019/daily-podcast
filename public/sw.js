const CACHE_NAME = 'daily-podcast-offline-v2'
const OFFLINE_PAGE = '/offline'
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]
const OFFLINE_HTML = [
  '<!doctype html><html lang="zh-TW"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="theme-color" content="#111827"><title>目前沒有網路連線｜DAVID888 Daily</title>',
  '<style>:root{color-scheme:light;font-family:system-ui,sans-serif}body{display:grid;min-height:100vh;margin:0;place-items:center;background:#f8fafc;color:#18181b}main{max-width:32rem;padding:2rem;text-align:center}h1{margin:0;font-size:1.5rem}p{color:#4b5563;line-height:1.6}</style>',
  '</head><body><main><h1>目前沒有網路連線</h1><p>重新連線後即可閱讀最新的 DAVID888 Daily 每日放送。</p></main></body></html>',
].join('')

globalThis.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(OFFLINE_PAGE, new Response(OFFLINE_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))
    await cache.addAll(PRECACHE_URLS)
  })())
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
