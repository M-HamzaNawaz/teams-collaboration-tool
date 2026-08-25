'use client'

import { useEffect, useState } from 'react'

import {
  ANDROID_DOWNLOAD_URL,
  androidShellUpdate,
  type ShellUpdate,
} from '@/lib/shell-update'
import { ArrowRightIcon, XIcon } from '@/lib/ui/icons'

/**
 * The Android substitute for auto-update (see lib/shell-update.ts).
 *
 * Deliberately a quiet bar, not a dialog: nothing is broken, and the person
 * is here to read their messages. Dismissal is remembered PER VERSION, so
 * saying "not now" is honoured until there is actually something newer —
 * the same rule the desktop updater's "Later" button follows.
 *
 * Renders nothing at all in a browser, in the PWA, or in the desktop shell.
 */

const DISMISS_KEY = 'confide-app-update-dismissed'

export function AppUpdateNotice() {
  const [update, setUpdate] = useState<ShellUpdate | null>(null)

  useEffect(() => {
    // Deferred: this reads window/navigator, which the server does not have,
    // and a synchronous setState in an effect body trips the React 19 lint.
    queueMicrotask(() => {
      const found = androidShellUpdate()
      if (!found) return
      try {
        if (localStorage.getItem(DISMISS_KEY) === found.latest) return
      } catch {
        // Private mode — show it; a repeat notice beats a silent stale app.
      }
      setUpdate(found)
    })
  }, [])

  if (!update) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, update!.latest)
    } catch {
      // Best effort.
    }
    setUpdate(null)
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-sel px-3 py-2 text-sm sm:px-4">
      <span className="min-w-0 flex-1">
        <span className="font-medium">A newer Confide app is available</span>
        <span className="ml-1 text-muted">
          {update.current
            ? `— you have ${update.current}, ${update.latest} is out.`
            : '— your installed app is out of date.'}
        </span>
      </span>
      {/* Opens in the system browser: the shell routes non-app hosts there,
          so the download lands in Android's own download manager rather than
          inside a webview that cannot install it. */}
      <a
        href={ANDROID_DOWNLOAD_URL}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-teal-d px-2.5 py-1 text-xs font-medium text-white"
      >
        Get it <ArrowRightIcon />
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover"
      >
        <XIcon />
      </button>
    </div>
  )
}
