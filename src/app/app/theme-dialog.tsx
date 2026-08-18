'use client'

import { createPortal } from 'react-dom'

import { currentTheme, setTheme, useCurrentTheme } from '@/lib/theme/apply'
import { THEMES } from '@/lib/theme/themes'
import { useEscape } from '@/lib/ui/dismiss'
import { CheckIcon } from '@/lib/ui/icons'

/**
 * Theme picker — a grid of live swatches. Clicking one applies it instantly
 * (and saves to the account), so the whole app previews as you browse.
 *
 * Two entry points: the account menu (dismissible), and first login
 * (`firstRun`), where the framing is a welcome rather than a settings panel.
 * Portaled to body — one call site sits inside the frosted top bar.
 */
export function ThemeDialog(props: { firstRun?: boolean; onClose: () => void }) {
  const current = useCurrentTheme()
  useEscape(props.onClose)

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-400 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-dialog-title"
        className="card-in w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-e2"
      >
        <header className="mb-4">
          <h2 id="theme-dialog-title" className="text-lg font-semibold">
            {props.firstRun ? 'Pick your theme' : 'Theme'}
          </h2>
          <p className="text-sm text-muted">
            {props.firstRun
              ? 'Choose how Confide looks. You can change it any time from your account menu.'
              : 'Applies instantly and follows you to any device.'}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((theme) => {
            const active = current === theme.id
            return (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                aria-pressed={active}
                className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? 'border-teal-d ring-2 ring-teal-d/40'
                    : 'border-border hover:bg-hover'
                }`}
              >
                {/* Swatch preview: the theme's rail on the left (its
                    signature), page base + surface card + accent beside it */}
                <span
                  className="relative h-14 w-full overflow-hidden rounded-lg border border-border-2"
                  style={{ background: theme.swatch.base }}
                >
                  <span
                    className="absolute bottom-0 left-0 top-0 w-3.5"
                    style={{ background: theme.swatch.rail }}
                  />
                  <span
                    className="absolute bottom-1.5 left-6 h-5 w-3/5 rounded"
                    style={{ background: theme.swatch.surface }}
                  />
                  <span
                    className="absolute right-1.5 top-1.5 h-4 w-4 rounded-full"
                    style={{ background: theme.swatch.accent }}
                  />
                </span>
                <span className="flex items-center justify-between">
                  <span className="text-sm font-medium">{theme.label}</span>
                  {active && (
                    <span className="text-teal-t">
                      <CheckIcon />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => {
              // First run: make sure SOMETHING is saved so the picker
              // doesn't reappear next login, even if they didn't tap a card.
              if (props.firstRun) setTheme(currentTheme())
              props.onClose()
            }}
            className="btn btn-primary"
          >
            {props.firstRun ? 'Continue' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
