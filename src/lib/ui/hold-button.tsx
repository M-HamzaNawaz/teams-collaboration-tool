'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Hold-to-confirm button (JobPulse §5): press and KEEP holding — a fill
 * sweeps across the button and the action fires only when the sweep
 * completes. Releasing early cancels with a quick rewind. More deliberate
 * than a click for actions with real consequences, and the sweep itself is
 * the progress affordance, so no separate countdown is needed.
 *
 * Works with mouse, touch (long-press context menu suppressed, scroll
 * gestures ignored via touch-none), and keyboard — hold Enter or Space;
 * key auto-repeat is filtered so the timer starts once.
 */
export function HoldButton(props: {
  onComplete: () => void
  disabled?: boolean
  /** How long the press must last. Default 1200ms. */
  holdMs?: number
  className?: string
  /** Fill overlay classes — pick a tint that reads on the button color. */
  fillClassName?: string
  /** Shown in place of children while the press is in progress. */
  holdingLabel?: React.ReactNode
  children: React.ReactNode
}) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdMs = props.holdMs ?? 1200

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function start() {
    if (props.disabled || timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      props.onComplete()
    }, holdMs)
  }

  function cancel() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setHolding(false)
  }

  return (
    <button
      type="button"
      disabled={props.disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return // right/middle click must not arm it
        start()
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') cancel()
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative touch-none select-none overflow-hidden ${props.className ?? ''}`}
      style={{
        // Presses in: the button itself reacts the instant the hold starts.
        transform: holding ? 'scale(0.96)' : 'scale(1)',
        transition: 'transform 160ms ease',
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 origin-left ${props.fillClassName ?? 'bg-white/25'}`}
        style={{
          transform: holding ? 'scaleX(1)' : 'scaleX(0)',
          transition: holding
            ? `transform ${holdMs}ms linear`
            : 'transform 150ms ease-out',
        }}
      />
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {holding && props.holdingLabel !== undefined
          ? props.holdingLabel
          : props.children}
      </span>
    </button>
  )
}
