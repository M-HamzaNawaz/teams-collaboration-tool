'use client'

import { useDesktopNotifications } from '@/lib/notifications/desktop'
import { BellIcon } from '@/lib/ui/icons'

/**
 * The notifications line in the account menu — the one control for both
 * tiers (in-page/native alerts AND the web-push subscription). Shared by
 * the top bar and the dock so both menus stay in sync (the hook mirrors
 * state across them).
 *
 * Reads as a settings row — name on the left, state on the right — rather
 * than a sentence with a status light after it. There WAS a coloured dot
 * here; it repeated the On/Off already in the label, was aria-hidden (so
 * it said nothing to a screen reader either way), carried its meaning in
 * teal-vs-grey alone, and spent ~14px of a 208px menu doing it.
 *
 * Not called "Desktop notifications" any more: the same toggle drives web
 * push in a browser, and on a phone what it produces is a phone
 * notification.
 */
export function NotifyMenuItem() {
  const { permission, ready, toggle } = useDesktopNotifications()

  const blocked = permission === 'denied' || permission === 'unsupported'
  const label =
    permission === 'unsupported'
      ? 'Notifications not supported'
      : permission === 'denied'
        ? 'Notifications blocked in browser'
        : 'Notifications'
  // Both spans sit inside the button, so the accessible name is still the
  // whole thing — "Notifications Off" — with no aria plumbing needed.
  const state = blocked ? null : ready ? 'On' : 'Off'

  return (
    <button
      onClick={() => void toggle()}
      disabled={blocked}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover disabled:opacity-50"
    >
      <BellIcon />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {state && <span className="shrink-0 text-xs text-muted">{state}</span>}
    </button>
  )
}
