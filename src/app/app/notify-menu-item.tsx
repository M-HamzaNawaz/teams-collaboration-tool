'use client'

import { useDesktopNotifications } from '@/lib/notifications/desktop'
import { BellIcon } from '@/lib/ui/icons'

/**
 * The "Desktop notifications" line in the account menu — the one control for
 * Tier 1 alerts. Shared by the top bar and the dock so both menus stay in
 * sync (the hook mirrors state across them).
 */
export function NotifyMenuItem() {
  const { permission, ready, toggle } = useDesktopNotifications()

  const blocked = permission === 'denied' || permission === 'unsupported'
  const label =
    permission === 'unsupported'
      ? 'Notifications not supported'
      : permission === 'denied'
        ? 'Notifications blocked in browser'
        : ready
          ? 'Desktop notifications: On'
          : 'Desktop notifications: Off'

  return (
    <button
      onClick={() => void toggle()}
      disabled={blocked}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover disabled:opacity-50"
    >
      <BellIcon />
      <span className="flex-1">{label}</span>
      {!blocked && (
        <span
          className={`h-2 w-2 rounded-full ${ready ? 'bg-teal-d' : 'bg-border-2'}`}
          aria-hidden="true"
        />
      )}
    </button>
  )
}
