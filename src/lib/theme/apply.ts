'use client'

import { useEffect, useState } from 'react'

import { DEFAULT_THEME, isValidTheme } from './themes'

/**
 * Theme application + persistence.
 *
 * The DB (profiles.theme) is the source of truth so a choice follows the
 * user across devices; localStorage mirrors it only so the boot script can
 * paint the right theme before hydration (no flash).
 *
 *  - useApplyServerTheme: run ONCE in the shell to reconcile the DB value
 *    over whatever the boot script painted from a stale local mirror.
 *  - useCurrentTheme: read the live theme (for highlighting the picker).
 *  - setTheme: apply instantly + save to the account.
 */

const KEY = 'confide-theme'
const EVENT = 'confide-theme-change'

export function currentTheme(): string {
  if (typeof document === 'undefined') return DEFAULT_THEME
  const pinned = document.documentElement.getAttribute('data-theme')
  return isValidTheme(pinned) ? pinned : DEFAULT_THEME
}

function applyThemeLocal(id: string): void {
  document.documentElement.setAttribute('data-theme', id)
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Private mode — the attribute is what actually paints.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Apply a theme now and save it to the account (fire-and-forget). */
export function setTheme(id: string): void {
  if (!isValidTheme(id)) return
  applyThemeLocal(id)
  void fetch('/api/me/theme', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: id }),
  })
}

/** Reconcile the DB theme over the pre-paint local mirror, once on load. */
export function useApplyServerTheme(serverTheme: string | null): void {
  useEffect(() => {
    if (isValidTheme(serverTheme)) {
      queueMicrotask(() => applyThemeLocal(serverTheme))
    }
  }, [serverTheme])
}

/** The currently-applied theme id, kept in sync across pickers. */
export function useCurrentTheme(): string {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME)
  useEffect(() => {
    queueMicrotask(() => setThemeState(currentTheme()))
    const sync = () => setThemeState(currentTheme())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return theme
}
