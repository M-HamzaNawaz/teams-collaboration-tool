/**
 * Confide service worker (M10-02) — the OFFLINE SHELL, nothing more.
 *
 * Caches static assets and an offline fallback page. Deliberately never
 * caches API responses or pages with message content: the product's pitch
 * is confidentiality, and a shared device's browser cache is not where
 * held messages go to be discovered.
 */
const CACHE = 'confide-shell-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Cache-first is safe ONLY because production filenames are content
  // hashed, so new code means a new URL and a guaranteed miss. A dev server
  // serves chunks at stable, path-derived URLs whose contents change on
  // every edit, so the same rule would pin the browser to whatever it loaded
  // first — forever, and through a hard refresh. Registration is
  // production-only, but a worker outlives the build that registered it, so
  // this refuses to do it on a local origin rather than trusting that.
  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'

  // Static assets: cache-first (immutable, hashed filenames).
  if (
    !isLocal &&
    (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
    return
  }

  // Navigations: network-first, offline fallback. Never cached.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    )
  }
})

/* ── Web push (Tier 2) ──────────────────────────────────────────────
   The server sends an encrypted payload; showing a notification is
   mandatory on push (Chrome shows a generic one otherwise). tag=groupId
   collapses a burst from one group into a single banner. */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* malformed payload — show the fallback below */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Confide', {
      body: data.body || 'New message',
      tag: data.tag || 'confide',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { groupId: data.groupId || null },
    }),
  )
})

/* Click: focus an open Confide window and steer it to the group, or open
   a fresh one. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const groupId = event.notification.data && event.notification.data.groupId
  const target = groupId ? `/app/chat?g=${groupId}` : '/app/chat'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (win.url.includes('/app')) {
          win.focus()
          return win.navigate(target)
        }
      }
      return clients.openWindow(target)
    }),
  )
})
