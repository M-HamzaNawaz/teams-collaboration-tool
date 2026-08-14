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

/**
 * The theme saved on THIS device, or null if none.
 *
 * localStorage is the freshest local truth: it's written on every change
 * and painted pre-hydration by the boot script. The DB value can lag it,
 * because a save is fire-and-forget and the server prop isn't refreshed —
 * so a fresh local choice must never be overruled by the DB.
 */
export function localTheme(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const t = localStorage.getItem(KEY)
    return isValidTheme(t) ? t : null
  } catch {
    return null
  }
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

/**
 * Pull the DB theme only onto a NEW device — one with no local choice yet.
 * If this device already has a theme in localStorage, that is the freshest
 * truth (the boot script already painted it), so leave it alone; overriding
 * it with a possibly-stale server prop is what clobbered a just-made change.
 */
export function useApplyServerTheme(serverTheme: string | null): void {
  useEffect(() => {
    queueMicrotask(() => {
      if (localTheme()) return
      if (isValidTheme(serverTheme)) applyThemeLocal(serverTheme)
    })
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
