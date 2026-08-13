'use client'

import gsap from 'gsap'
import { useEffect, useRef } from 'react'

import { prefersReducedMotion } from '@/lib/ui/dismiss'

/**
 * Shared auth-page chrome (JobPulse §4.6): a centered 400px column, a 56px
 * near-black "C" mark, a display title, and one solid white card — login,
 * signup, reset, and invite all read as the same product. Class constants
 * keep field styling identical everywhere.
 */

export const inputClass =
  'h-[42px] rounded-lg border border-border bg-surface px-3.5 text-sm outline-none transition-colors focus:border-teal-d'

export const primaryButtonClass = 'btn btn-primary py-2.5'

/** Kept for call-site compatibility; the primary button is flat near-black. */
export const primaryButtonStyle: React.CSSProperties = {}

export function AuthShell(props: {
  title: string
  subtitle?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'lg'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-anim="mark"]', {
          scale: 0.6,
          opacity: 0,
          duration: 0.4,
          ease: 'back.out(1.7)',
        })
        .from(
          '[data-anim="card"]',
          { y: 20, opacity: 0, duration: 0.45 },
          '-=0.15',
        )
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <main
      ref={ref}
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <div
        className={`w-full ${props.maxWidth === 'lg' ? 'max-w-lg' : 'max-w-[400px]'}`}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            data-anim="mark"
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-foreground text-xl font-bold text-background"
          >
            C
          </div>
          <h1 className="text-[28px] font-bold leading-[34px] tracking-tight">
            {props.title}
          </h1>
          {props.subtitle && (
            <p className="mt-1 text-sm text-muted">{props.subtitle}</p>
          )}
        </div>
        <div
          data-anim="card"
          className="rounded-xl border border-border bg-surface p-6 shadow-e1"
        >
          {props.children}
        </div>
      </div>
    </main>
  )
}

/** Teal-tint success toast (JobPulse §5) — slides up, fades in. */
export function SuccessToast(props: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || prefersReducedMotion()) return
    gsap.fromTo(
      ref.current,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.26, ease: 'power2.out' },
    )
  }, [props.message])

  return (
    <div
      ref={ref}
      role="status"
      className="fixed bottom-6 left-1/2 z-[500] -translate-x-1/2 rounded-[10px] border border-teal-d bg-sel px-4 py-2.5 text-sm font-medium text-teal-t shadow-e2"
    >
      {props.message}
    </div>
  )
}
