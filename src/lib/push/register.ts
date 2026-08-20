'use client'

/**
 * Browser-side push registration (Tier 2).
 *
 * Rides the notifications toggle: enabling subscribes this browser with
 * the server, disabling unsubscribes. While a push subscription is live,
 * the in-page Notification path stands down — the service worker shows
 * pushes even when the page is asleep, which is the whole point; both
 * firing would double-notify. The desktop shell never registers (its
 * webview lacks Web Push); its native plugin path is untouched.
 */

import { isDesktopShell } from '@/lib/desktop-shell'
import { publicEnv } from '@/lib/env/public'

let pushActive = false

/** True while this browser has a live push subscription — the in-page
    notification path checks this to avoid double-notifying. */
export function isPushActive(): boolean {
  return pushActive
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !isDesktopShell() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    Boolean(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  )
}

/** The push API wants the VAPID key as bytes, not base64url. */
function vapidKeyBytes(): Uint8Array {
  const base64 = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Subscribe this browser and register with the server. Idempotent. */
export async function enablePush(): Promise<boolean> {
  if (!supported()) return false
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes() as BufferSource,
      }))
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    pushActive = response.status === 201
    return pushActive
  } catch {
    // Push service unreachable or permission revoked — the in-page
    // notification path keeps working as the fallback.
    pushActive = false
    return false
  }
}

/** Drop this browser's subscription (toggle off). */
export async function disablePush(): Promise<void> {
  pushActive = false
  if (!supported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    await subscription.unsubscribe()
  } catch {
    // Best-effort; a dead subscription also gets pruned server-side on 410.
  }
}
