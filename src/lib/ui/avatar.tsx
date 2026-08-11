import { initials } from './colors'

/**
 * JobPulse avatar convention — pills/circles are reserved for people and
 * status dots; everything else is a square:
 *   - GroupMark: sunken square, ink initials (groups, workspaces)
 *   - PersonMark: teal circle, near-black initials (people)
 *
 * Color never carries identity on its own — the initials do.
 */

export function GroupMark(props: { name: string; size?: number; className?: string }) {
  const size = props.size ?? 34
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg bg-surface-2 font-semibold text-foreground ${props.className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {initials(props.name)}
    </span>
  )
}

export function PersonMark(props: { name: string; size?: number; className?: string }) {
  const size = props.size ?? 28
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-teal font-semibold text-[#1a1a1a] ${props.className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
    >
      {initials(props.name)}
    </span>
  )
}
