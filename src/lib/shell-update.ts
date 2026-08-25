'use client'

/**
 * "A newer app is available" — the Android answer to auto-update.
 *
 * The desktop shell updates itself: it polls the release feed and installs.
 * Android forbids silent self-install, so no amount of work makes that
 * possible outside the Play Store. What IS possible is telling people, and
 * the web app is the right thing to tell them WITH: it reaches every phone
 * on every deploy, so it always knows more than the shell wrapped around it.
 *
 * The comparison is therefore inverted from desktop. Rather than the app
 * asking a server what the newest version is, the server-rendered app already
 * carries that number and checks what it is running inside.
 */

/**
 * The Android shell we expect people to be on. BUMP THIS when an
 * `android-v*` release goes out — that is what makes the notice appear on
 * older installs. Deploying the web app is enough; nothing else to ship.
 */
export const LATEST_ANDROID_SHELL = '0.1.2'

export const ANDROID_DOWNLOAD_URL =
  'https://github.com/M-HamzaNawaz/teams-collaboration-tool/releases/latest'

/** Compare dotted versions. Returns true when `a` is older than `b`. */
function isOlder(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

export type ShellUpdate = {
  /** null when the shell predates the version marker — itself proof it is old. */
  current: string | null
  latest: string
}

/**
 * Non-null only when this is an Android shell running behind the current
 * release. Everything else returns null and shows nothing:
 *
 *   - a plain browser or the installed PWA — updates on every deploy
 *   - the desktop shell — has a real updater, and nagging it would be wrong
 *   - an Android shell already up to date
 */
export function androidShellUpdate(): ShellUpdate | null {
  if (typeof window === 'undefined') return null

  const w = window as unknown as {
    __TAURI__?: unknown
    __CONFIDE_SHELL__?: { version?: string }
  }
  if (!w.__TAURI__) return null
  // Platform comes from the user agent, not from an IPC call: reading it
  // natively would need a new permission in the shell's capability file,
  // and that file is deliberately narrow (notifications + badge, nothing
  // else). A string match costs nothing and widens no surface.
  if (!/Android/i.test(navigator.userAgent)) return null

  const current = w.__CONFIDE_SHELL__?.version ?? null
  if (current && !isOlder(current, LATEST_ANDROID_SHELL)) return null

  return { current, latest: LATEST_ANDROID_SHELL }
}
