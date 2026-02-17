const CACHE_VERSION = 'v2'
const APP_SHELL_CACHE = `smart-accounting-shell-${CACHE_VERSION}`
const STATIC_CACHE = `smart-accounting-static-${CACHE_VERSION}`
const OFFLINE_URL = '/offline.html'

// Feature flags (set at build time or via postMessage)
let BG_SYNC_ENABLED = false
let PUSH_ENABLED = false

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login',
  '/register',
  '/forgot-password',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icon.svg',
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

const isStaticAssetRequest = (request, url) => {
  if (url.origin !== self.location.origin) return false

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    return true
  }

  return /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname)
}

const shouldBypassCaching = (request, url) => {
  if (request.method !== 'GET') return true
  if (url.pathname.startsWith('/api/')) return true
  if (request.headers.has('authorization')) return true

  return false
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE)
      await shellCache.addAll(PRECACHE_URLS)

      try {
        const indexResponse = await fetch('/index.html', { cache: 'no-store' })
        await shellCache.put('/index.html', indexResponse.clone())

        const html = await indexResponse.text()
        const assetPaths = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), (match) => match[1])

        if (assetPaths.length > 0) {
          const staticCache = await caches.open(STATIC_CACHE)
          await Promise.all(
            Array.from(new Set(assetPaths)).map(async (assetPath) => {
              try {
                const assetResponse = await fetch(assetPath, { cache: 'no-store' })
                if (assetResponse.ok) {
                  await staticCache.put(assetPath, assetResponse)
                }
              } catch {
                // Ignore individual asset pre-cache failures.
              }
            }),
          )
        }
      } catch {
        // Installation should continue even if network is temporarily unavailable.
      }

      self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const expectedCaches = new Set([APP_SHELL_CACHE, STATIC_CACHE])
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
  
  // Handle feature flag updates
  if (event.data && event.data.type === 'SET_FEATURES') {
    BG_SYNC_ENABLED = event.data.bgSync === true
    PUSH_ENABLED = event.data.push === true
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (shouldBypassCaching(request, url)) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request)
          const cache = await caches.open(APP_SHELL_CACHE)
          await cache.put('/index.html', networkResponse.clone())
          return networkResponse
        } catch {
          const cache = await caches.open(APP_SHELL_CACHE)
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

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const cachedResponse = await cache.match(request)

        if (cachedResponse) {
          return cachedResponse
        }

        const networkResponse = await fetch(request)
        if (networkResponse.ok) {
          await cache.put(request, networkResponse.clone())
        }

        return networkResponse
      })(),
    )
  }
})

// Background Sync Event (optional, feature-flagged)
self.addEventListener('sync', (event) => {
  if (!BG_SYNC_ENABLED) {
    return
  }

  if (event.tag === 'sync-queue') {
    event.waitUntil(
      (async () => {
        try {
          // Open IndexedDB and get queued items
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('smart-accounting-sync', 1)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          const transaction = db.transaction(['sync-queue'], 'readonly')
          const store = transaction.objectStore('sync-queue')
          const items = await new Promise((resolve, reject) => {
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result || [])
            request.onerror = () => reject(request.error)
          })

          // Process each item sequentially
          for (const item of items) {
            try {
              const response = await fetch(item.url, {
                method: item.method,
                headers: item.headers,
                body: JSON.stringify(item.payload),
              })

              if (response.ok) {
                // Success - remove from queue
                const writeTransaction = db.transaction(['sync-queue'], 'readwrite')
                const writeStore = writeTransaction.objectStore('sync-queue')
                writeStore.delete(item.id)
              } else if (response.status === 409) {
                // Conflict - stop and notify user
                self.registration.showNotification('Synchronisatiefout', {
                  body: `Conflict bij synchroniseren van ${item.type}. Controleer handmatig.`,
                  icon: '/icon-192x192.png',
                  tag: 'sync-error',
                })
                break
              } else {
                // Other error - increment retry count
                const writeTransaction = db.transaction(['sync-queue'], 'readwrite')
                const writeStore = writeTransaction.objectStore('sync-queue')
                item.retries += 1
                if (item.retries < 3) {
                  writeStore.put(item)
                } else {
                  // Max retries - remove and notify
                  writeStore.delete(item.id)
                  self.registration.showNotification('Synchronisatiefout', {
                    body: `Kan ${item.type} niet synchroniseren na 3 pogingen.`,
                    icon: '/icon-192x192.png',
                    tag: 'sync-error',
                  })
                }
              }
            } catch (error) {
              // Network error - will retry on next sync
              console.error('Sync error:', error)
            }
          }

          db.close()
        } catch (error) {
          console.error('Background sync failed:', error)
        }
      })(),
    )
  }
})

// Push Event (optional, feature-flagged)
self.addEventListener('push', (event) => {
  if (!PUSH_ENABLED) {
    return
  }

  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { title: 'Melding', body: event.data.text() }
    }
  }

  const title = data.title || 'Smart Accounting'
  const options = {
    body: data.body || 'U heeft een nieuwe melding',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag || 'notification',
    data: data.url ? { url: data.url } : undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.notification.data?.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url),
    )
  } else {
    event.waitUntil(
      clients.openWindow('/'),
    )
  }
})
