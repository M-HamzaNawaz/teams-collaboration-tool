'use client'

import { useEffect } from 'react'

/**
 * Service worker registration (M10-02). The worker itself
 * (public/sw.js) caches the app shell and serves an offline fallback —
 * deliberately NOTHING dynamic: messages are confidential and live in the
 * database, not in a browser cache.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js')
      return
    }

    // Development: actively REMOVE any worker on this origin, and its cache.
    //
    // Registration is production-only, but a worker outlives the build that
    // registered it — run `npm run start` on a port once and every later
    // `npm run dev` on that same port is served by it. The static-asset rule
    // in sw.js is cache-first on the grounds that filenames are hashed, which
    // is true of a production build and false of a dev one: Turbopack serves
    // chunks at stable, path-derived URLs whose contents change on every
    // edit. The result is a browser pinned to the first version of the app it
    // ever loaded, immune to a hard refresh, with no visible cause.
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister()
    })
    if ('caches' in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith('confide-')) void caches.delete(key)
        }
      })
    }
  }, [])
  return null
}
