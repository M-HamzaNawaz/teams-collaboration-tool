'use client'

import { useEffect, useRef } from 'react'

/**
 * Deployment-aware auto refresh — the cure for stale pages everywhere the
 * app runs (desktop shell webview, forgotten browser tabs).
 *
 * Every 5 minutes, and whenever the page's visibility flips, compare the
 * server's deployment marker with the one this page booted under. On
 * mismatch, reload — but only at a moment the user isn't mid-something:
 * the instant the page goes hidden, or the instant they return to it
 * (before any interaction). Never mid-read, never mid-typing.
 *
 * The reload is loss-free by design: the URL (including ?g= deep links)
 * survives, the session cookie survives, and the chat page server-renders
 * its first page of messages.
 */
export function AutoRefresh() {
  const baseline = useRef<string | null>(null)
  const stale = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function check(): Promise<void> {
      try {
        const response = await fetch('/api/version', { cache: 'no-store' })
        if (!response.ok) return
        const { version } = (await response.json()) as { version?: string }
        if (cancelled || !version) return
        if (baseline.current === null) {
          baseline.current = version
          return
        }
        if (version !== baseline.current) stale.current = true
        if (stale.current && document.visibilityState === 'hidden') {
          location.reload()
        }
      } catch {
        // Offline or mid-deploy hiccup — the next tick tries again.
      }
    }

    const interval = setInterval(() => void check(), 5 * 60_000)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (stale.current) location.reload()
        return
      }
      // Just came back: re-check now, and reload before they touch anything.
      void check().then(() => {
        if (!cancelled && stale.current) location.reload()
      })
    }
    document.addEventListener('visibilitychange', onVisibility)
    queueMicrotask(() => void check())

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
