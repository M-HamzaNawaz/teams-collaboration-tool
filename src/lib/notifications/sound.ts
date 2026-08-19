'use client'

/**
 * Notification sounds, synthesized with the Web Audio API — no audio asset
 * to fetch, identical on the web and inside the desktop shell.
 *
 * Browser autoplay policy suspends an AudioContext created before the
 * user's first interaction; in that case we try to resume and simply skip
 * this ding rather than queue stale ones. Throttled so a burst of messages
 * produces one sound, not a drum roll.
 */

let ctx: AudioContext | null = null
let lastPlayed = 0
const THROTTLE_MS = 1500

function running(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    ctx ??= new AudioContext()
  } catch {
    return null // engine without Web Audio — silence, never a crash
  }
  if (ctx.state !== 'running') {
    void ctx.resume().catch(() => {})
    return null // resume is async; the next event will sound
  }
  return ctx
}

function throttled(): boolean {
  const now = Date.now()
  if (now - lastPlayed < THROTTLE_MS) return true
  lastPlayed = now
  return false
}

/** One decaying sine note: quick attack, exponential fade. */
function tone(
  ac: AudioContext,
  freq: number,
  at: number,
  duration: number,
  peak: number,
) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(at)
  osc.stop(at + duration + 0.05)
}

/** Two-note ascending chime — plays alongside a desktop notification. */
export function playNotificationSound(): void {
  const ac = running()
  if (!ac || throttled()) return
  const t = ac.currentTime
  tone(ac, 880, t, 0.18, 0.1) // A5
  tone(ac, 1174.66, t + 0.09, 0.24, 0.08) // D6
}

/** Single soft pop — a message landing in the chat you're looking at. */
export function playMessageSound(): void {
  const ac = running()
  if (!ac || throttled()) return
  tone(ac, 659.25, ac.currentTime, 0.12, 0.05) // E5, quieter
}
