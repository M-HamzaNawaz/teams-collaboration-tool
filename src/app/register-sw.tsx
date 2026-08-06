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
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js')
    }
  }, [])
  return null
}
