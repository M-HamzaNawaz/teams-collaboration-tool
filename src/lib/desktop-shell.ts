'use client'

/**
 * Bridge to the Confide desktop shell (Tauri). Inside the shell,
 * window.__TAURI__ exists (withGlobalTauri) and these helpers reach native
 * capabilities the webview lacks; on the plain web every one of them
 * no-ops, so call sites never need to know where they're running.
 *
 * The shell's capability file scopes exactly which commands this remote
 * origin may invoke: notifications and the window badge, nothing else.
 */

type TauriGlobal = {
  core: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  }
}

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null
}

export function isDesktopShell(): boolean {
  return tauri() !== null
}

/** Fire a native OS notification. Returns false when not in the shell. */
export async function shellNotify(
  title: string,
  body: string,
): Promise<boolean> {
  const t = tauri()
  if (!t) return false
  try {
    await t.core.invoke('plugin:notification|notify', {
      options: { title, body },
    })
  } catch {
    // Shell present but the call failed (permission revoked at OS level) —
    // report handled anyway so the caller never double-fires a web toast.
  }
  return true
}

/** Ask the OS for notification permission (macOS prompts; Linux is a yes). */
export async function shellRequestNotifyPermission(): Promise<void> {
  const t = tauri()
  if (!t) return
  try {
    await t.core.invoke('plugin:notification|request_permission')
  } catch {
    // Non-fatal: notify() itself will surface any real denial.
  }
}

/** Set the dock/taskbar badge. 0 clears it. No-op on the plain web. */
export async function shellSetBadge(count: number): Promise<void> {
  const t = tauri()
  if (!t) return
  try {
    await t.core.invoke('plugin:window|set_badge_count', {
      label: 'main',
      value: count > 0 ? count : null,
    })
  } catch {
    // Platform without badge support — fine.
  }
}

/**
 * Open a download URL. window.open is inert inside a webview, so the shell
 * navigates in place instead — the response's attachment disposition turns
 * the navigation into a native download (saved to ~/Downloads) and the
 * page never actually leaves.
 */
export function openDownload(url: string): void {
  if (isDesktopShell()) {
    window.location.assign(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}
