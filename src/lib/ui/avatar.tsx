import { initials } from './colors'

/**
 * JobPulse avatar convention — pills/circles are reserved for people and
 * status dots; everything else is a square:
 *   - GroupMark: sunken square, ink initials (groups, workspaces)
 *   - PersonMark: teal circle, near-black initials (people)
 *
 * Color never carries identity on its own — the initials do.
 *
 * PersonMark takes an optional `online`: pass a boolean to show a presence
 * dot (teal = online, grey = offline); omit it entirely for no dot.
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

export function PersonMark(props: {
  name: string
  size?: number
  className?: string
  online?: boolean
}) {
  const size = props.size ?? 28
  const dot = Math.max(9, Math.round(size * 0.32))
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 ${props.className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full bg-teal font-semibold text-[#1a1a1a]"
        style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}
      >
        {initials(props.name)}
      </span>
      {props.online !== undefined && (
        <span
          title={props.online ? 'Online' : 'Offline'}
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-surface ${
            props.online ? 'bg-teal-d' : 'bg-border-2'
          }`}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  )
}
