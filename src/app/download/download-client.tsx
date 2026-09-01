'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { DownloadIcon } from '@/lib/ui/icons'

/**
 * "Get the apps" page. Detects the visitor's platform and leads with THEIR
 * button; installer links come from /api/downloads (always the latest
 * release). Mobile = install the web app to the home screen (PWA): Android
 * gets the real browser install prompt, iPhone gets the two-tap recipe.
 */

type Links = {
  version: string
  windows: string | null
  mac: string | null
  linuxAppImage: string | null
  linuxDeb: string | null
}

type Platform = 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'other'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return 'other'
}

/** Captured ASAP at module load — the browser fires it once, early. */
let deferredInstallPrompt: (Event & { prompt: () => Promise<void> }) | null =
  null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallPrompt = event as Event & { prompt: () => Promise<void> }
  })
}

export function DownloadClient() {
  const [links, setLinks] = useState<Links | null>(null)
  const [platform, setPlatform] = useState<Platform>('other')
  const [installed, setInstalled] = useState(false)
  const [host, setHost] = useState('')

  useEffect(() => {
    queueMicrotask(() => {
      setPlatform(detectPlatform())
      setHost(window.location.host)
    })
    void fetch('/api/downloads')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLinks(d as Links))
      .catch(() => {})
  }, [])

  const desktop = useMemo(
    () =>
      [
        { key: 'windows', label: 'Windows', url: links?.windows, hint: '.exe installer' },
        { key: 'mac', label: 'macOS', url: links?.mac, hint: '.dmg · Intel & Apple Silicon' },
        { key: 'linux', label: 'Linux', url: links?.linuxAppImage, hint: 'AppImage · self-updating' },
      ] as const,
    [links],
  )

  async function installMobile() {
    if (!deferredInstallPrompt) return
    await deferredInstallPrompt.prompt()
    deferredInstallPrompt = null
    setInstalled(true)
  }

  const primary = desktop.find((d) => d.key === platform)
  const rest = desktop.filter((d) => d.key !== platform)
  const isMobile = platform === 'android' || platform === 'ios'

  return (
    <main className="flex min-h-screen flex-col items-center bg-background p-6 pt-14">
      <div className="w-full max-w-130">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-foreground text-xl font-bold text-background">
            C
          </div>
          <h1 className="text-[28px] font-bold leading-8.5 tracking-tight">
            Get Confide on every device
          </h1>
          <p className="mt-1 text-sm text-muted">
            Same account everywhere — install once, stay signed in.
            {links && (
              <span className="font-mono text-xs"> · v{links.version}</span>
            )}
          </p>
        </div>

        {/* ── Desktop ── */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-e1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Desktop app
          </h2>
          <p className="mt-1 text-sm text-muted">
            Its own window and icon, system notifications, updates itself.
          </p>

          {!isMobile && primary && (
            <a
              href={primary.url ?? '#'}
              aria-disabled={!primary.url}
              className={`btn btn-primary mt-4 w-full py-3 ${!primary.url ? 'pointer-events-none opacity-50' : ''}`}
            >
              <DownloadIcon /> Download for {primary.label}
              <span className="font-normal opacity-70">· {primary.hint}</span>
            </a>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {(isMobile || !primary ? desktop : rest).map((d) => (
              <a
                key={d.key}
                href={d.url ?? '#'}
                aria-disabled={!d.url}
                className={`btn btn-secondary flex-1 ${!d.url ? 'pointer-events-none opacity-50' : ''}`}
              >
                <DownloadIcon /> {d.label}
              </a>
            ))}
          </div>

          {platform === 'linux' && links?.linuxDeb && (
            <p className="mt-3 text-xs text-muted">
              Prefer a system install?{' '}
              <a href={links.linuxDeb} className="underline underline-offset-2">
                Download the .deb
              </a>{' '}
              (updates need a manual reinstall — the AppImage updates itself).
            </p>
          )}

          <p className="mt-3 text-xs text-muted">
            First open: Windows may show “Windows protected your PC” — click
            More info → Run anyway. On a Mac, right-click the app → Open the
            first time.
          </p>
        </section>

        {/* ── Mobile ── */}
        <section className="mt-4 rounded-xl border border-border bg-surface p-5 shadow-e1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Mobile app
          </h2>
          <p className="mt-1 text-sm text-muted">
            Install Confide to your home screen — full-screen app with its
            own icon{platform === 'android' ? ' and notifications' : ''}.
          </p>

          {installed ? (
            <p className="mt-4 rounded-lg bg-sel p-3 text-sm font-medium text-teal-t">
              Done — Confide is on your home screen.
            </p>
          ) : platform === 'android' ? (
            <>
              <button
                onClick={() => void installMobile()}
                className="btn btn-primary mt-4 w-full py-3"
              >
                <DownloadIcon /> Install on this phone
              </button>
              <p className="mt-2 text-xs text-muted">
                No prompt? Open your browser menu (⋮) → “Install app” or “Add
                to Home screen”.
              </p>
            </>
          ) : platform === 'ios' ? (
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
              <li>
                Open this page in <span className="font-medium">Safari</span>
              </li>
              <li>
                Tap the <span className="font-medium">Share</span> button
                (square with an arrow)
              </li>
              <li>
                Tap <span className="font-medium">Add to Home Screen</span>
              </li>
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Open{' '}
              <span className="font-mono text-xs">{host}/download</span> on
              your phone and the install button appears here.
            </p>
          )}
        </section>

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="underline underline-offset-2">
            Or continue in the browser →
          </Link>
        </p>
      </div>
    </main>
  )
}
