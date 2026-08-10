'use client'

import { useEffect, useState } from 'react'

import { MoonIcon, SunIcon } from './icons'

/**
 * Light/dark toggle. The choice lands on <html data-theme> (which pins
 * color-scheme — every light-dark() token flips instantly) and persists in
 * localStorage. First visit follows the OS; the boot script in layout.tsx
 * restores a saved choice BEFORE paint, so there is no flash.
 */

const STORAGE_KEY = 'confide-theme'

function currentEffectiveTheme(): 'light' | 'dark' {
  const pinned = document.documentElement.getAttribute('data-theme')
  if (pinned === 'light' || pinned === 'dark') return pinned
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeToggle() {
  // Rendered on the server as a neutral placeholder; the real state mounts
  // client-side (theme is a browser concern, hydration must match SSR).
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  useEffect(() => {
    queueMicrotask(() => setTheme(currentEffectiveTheme()))
  }, [])

  function toggle() {
    const next = currentEffectiveTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(STORAGE_KEY, next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
    >
      {/* Placeholder until mounted: theme is a browser fact, and rendering
          either icon on the server would flash the wrong one. */}
      {theme === null ? (
        <span className="h-[18px] w-[18px]" />
      ) : theme === 'dark' ? (
        <SunIcon />
      ) : (
        <MoonIcon />
      )}
    </button>
  )
}
