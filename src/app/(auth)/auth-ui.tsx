'use client'

import gsap from 'gsap'
import { useEffect, useRef } from 'react'

/**
 * Shared auth-page chrome (M5-03 design pass): one card, one gradient mark,
 * one entrance animation — login, signup, reset, and invite all read as the
 * same product. Class constants keep field styling identical everywhere.
 */

export const inputClass =
  'rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-a'

export const primaryButtonClass =
  'rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform enabled:hover:scale-[1.02] disabled:opacity-40'

export const primaryButtonStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
}

export function AuthShell(props: {
  title: string
  subtitle?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'lg'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
        className={`w-full ${props.maxWidth === 'lg' ? 'max-w-lg' : 'max-w-sm'}`}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            data-anim="mark"
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md"
            style={primaryButtonStyle}
          >
            C
          </div>
          <h1 className="text-2xl font-semibold">{props.title}</h1>
          {props.subtitle && (
            <p className="mt-1 text-sm text-muted">{props.subtitle}</p>
          )}
        </div>
        <div
          data-anim="card"
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          {props.children}
        </div>
      </div>
    </main>
  )
}
