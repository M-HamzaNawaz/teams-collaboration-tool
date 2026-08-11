/**
 * Identity marks (JobPulse pass).
 *
 * The old multicolor gradient wheel is gone: in the mono palette, hue
 * encodes exactly one thing (teal = active/positive/attention), so avatars
 * carry identity through INITIALS, not color — groups are sunken squares,
 * people are teal circles. See src/lib/ui/avatar.tsx for the components.
 */

/** Initials for the avatar mark — "Nadia K." → "NK". */
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
