const CACHE_VERSION = 'v1'
const APP_CACHE = `smart-accounting-${CACHE_VERSION}`
const API_CACHE = `smart-accounting-api-${CACHE_VERSION}`
const STATIC_CACHE = `smart-accounting-static-${CACHE_VERSION}`
const OFFLINE_URL = '/offline.html'

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-192x192-maskable.png',
  '/icon-512x512-maskable.png',
  OFFLINE_URL,
]

const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Offline</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; }
      main { text-align: center; max-width: 36rem; padding: 1.5rem; }
      h1 { margin: 0 0 .75rem; font-size: 1.5rem; }
      p { margin: 0; color: #94a3b8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Geen internetverbinding</h1>
      <p>U bent offline. Open de app opnieuw zodra uw internetverbinding hersteld is.</p>
    </main>
  </body>
</html>`

const isSafeApiRequest = (request, url) => {
  if (request.method !== 'GET') return false
  if (!url.pathname.startsWith('/api/')) return false

  const hasAuthHeader = request.headers.has('authorization')
  const hasCookie = request.headers.has('cookie')
  const isAuthEndpoint = /^\/api\/(auth|login|logout|token|session)/.test(url.pathname)

  return !hasAuthHeader && !hasCookie && !isAuthEndpoint
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE)
      await cache.addAll(PRECACHE_URLS)

      const indexResponse = await fetch('/index.html', { cache: 'no-store' })
      await cache.put('/index.html', indexResponse.clone())

      const html = await indexResponse.text()
      const assetPaths = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), (match) => match[1])

      if (assetPaths.length > 0) {
        await cache.addAll(Array.from(new Set(assetPaths)))
      }

      self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const expectedCaches = new Set([APP_CACHE, API_CACHE, STATIC_CACHE])
      const cacheNames = await caches.keys()

      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!expectedCaches.has(cacheName)) {
            return caches.delete(cacheName)
          }
          return Promise.resolve(false)
        }),
      )

      await self.clients.claim()
    })(),
  )
})


self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request)
          const cache = await caches.open(APP_CACHE)
          cache.put('/index.html', networkResponse.clone())
          return networkResponse
        } catch {
          const cache = await caches.open(APP_CACHE)
          const cachedIndex = await cache.match('/index.html')
          if (cachedIndex) {
            return cachedIndex
          }

          const offlinePage = await cache.match(OFFLINE_URL)
          if (offlinePage) {
            return offlinePage
          }

          return new Response(OFFLINE_DOCUMENT, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            status: 503,
          })
        }
      })(),
    )

    return
  }

  if (url.origin === self.location.origin && isSafeApiRequest(request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE)

        try {
          const networkResponse = await fetch(request)
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone())
          }
          return networkResponse
        } catch {
          const cachedResponse = await cache.match(request)
          if (cachedResponse) {
            return cachedResponse
          }

          return new Response(JSON.stringify({ error: 'Offline and no cached API response available.' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          })
        }
      })(),
    )

    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const cachedResponse = await cache.match(request)

        if (cachedResponse) {
          return cachedResponse
        }

        const networkResponse = await fetch(request)

        if (networkResponse.ok && ['style', 'script', 'font', 'image'].includes(request.destination)) {
          cache.put(request, networkResponse.clone())
        }

        return networkResponse
      })(),
    )
  }
})
