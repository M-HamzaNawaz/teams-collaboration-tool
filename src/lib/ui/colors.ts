/**
 * Deterministic multicolor identity (M5-03).
 *
 * Groups and people are colored by hashing their id into a curated gradient
 * wheel — the same entity is always the same color, on every device, with
 * no database column. Ten pairs, tuned to stay legible under white text in
 * both themes.
 */

export type Gradient = { from: string; to: string }

const WHEEL: Gradient[] = [
  { from: '#6d5cff', to: '#9f7bff' }, // violet
  { from: '#00b3a4', to: '#38d9a9' }, // teal
  { from: '#f43f8e', to: '#fb7185' }, // pink
  { from: '#f59e0b', to: '#fbbf24' }, // amber
  { from: '#0ea5e9', to: '#38bdf8' }, // sky
  { from: '#8b5cf6', to: '#c084fc' }, // purple
  { from: '#10b981', to: '#4ade80' }, // emerald
  { from: '#ef4444', to: '#f87171' }, // red
  { from: '#3b82f6', to: '#818cf8' }, // blue
  { from: '#d946ef', to: '#f0abfc' }, // fuchsia
]

/** FNV-1a — tiny, stable, good spread for uuid strings. */
function hash(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function gradientFor(id: string): Gradient {
  return WHEEL[hash(id) % WHEEL.length]
}

/** Inline style for a gradient avatar/badge. */
export function gradientStyle(id: string): React.CSSProperties {
  const { from, to } = gradientFor(id)
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }
}

/** A solid accent (the gradient's start) — used for sender names. */
export function accentFor(id: string): string {
  return gradientFor(id).from
}

/** Initials for the avatar disc — "Nadia K." → "NK". */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}
