import React from 'react'

/**
 * Inline SVG icon set for the composer (Slack-reference accuracy without a
 * dependency). Stroke follows currentColor, so the muted/hover/active states
 * come free from the button's text color.
 */

function Icon(props: { children: React.ReactNode; size?: number; filled?: boolean }) {
  return (
    <svg
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill={props.filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}

export const BoldIcon = () => (
  <Icon>
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </Icon>
)

export const ItalicIcon = () => (
  <Icon>
    <line x1="19" x2="10" y1="4" y2="4" />
    <line x1="14" x2="5" y1="20" y2="20" />
    <line x1="15" x2="9" y1="4" y2="20" />
  </Icon>
)

export const UnderlineIcon = () => (
  <Icon>
    <path d="M6 4v6a6 6 0 0 0 12 0V4" />
    <line x1="4" x2="20" y1="20" y2="20" />
  </Icon>
)

export const StrikethroughIcon = () => (
  <Icon>
    <path d="M16 4H9a3 3 0 0 0-2.83 4" />
    <path d="M14 12a4 4 0 0 1 0 8H6" />
    <line x1="4" x2="20" y1="12" y2="12" />
  </Icon>
)

export const LinkIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
)

export const ListOrderedIcon = () => (
  <Icon>
    <line x1="10" x2="21" y1="6" y2="6" />
    <line x1="10" x2="21" y1="12" y2="12" />
    <line x1="10" x2="21" y1="18" y2="18" />
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </Icon>
)

export const ListIcon = () => (
  <Icon>
    <line x1="8" x2="21" y1="6" y2="6" />
    <line x1="8" x2="21" y1="12" y2="12" />
    <line x1="8" x2="21" y1="18" y2="18" />
    <line x1="3" x2="3.01" y1="6" y2="6" />
    <line x1="3" x2="3.01" y1="12" y2="12" />
    <line x1="3" x2="3.01" y1="18" y2="18" />
  </Icon>
)

export const QuoteIcon = () => (
  <Icon>
    <path d="M17 6H3" />
    <path d="M21 12H8" />
    <path d="M21 18H8" />
    <path d="M3 12v6" />
  </Icon>
)

export const CodeIcon = () => (
  <Icon>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
)

export const CodeBlockIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="m10 9-3 3 3 3" />
    <path d="m14 15 3-3-3-3" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Icon>
)

export const SmileIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" x2="9.01" y1="9" y2="9" />
    <line x1="15" x2="15.01" y1="9" y2="9" />
  </Icon>
)

export const AtSignIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </Icon>
)

export const VideoIcon = () => (
  <Icon>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </Icon>
)

export const MicIcon = () => (
  <Icon>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </Icon>
)

export const SlashSquareIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <line x1="9" x2="15" y1="15" y2="9" />
  </Icon>
)

export const SendIcon = () => (
  <Icon filled>
    <path
      stroke="none"
      d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"
    />
  </Icon>
)

export const ChevronDownIcon = () => (
  <Icon size={14}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

/* ── App chrome (top bar, menus) ─────────────────────────────────────── */

export const LayoutDashboardIcon = () => (
  <Icon>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </Icon>
)

export const MessageSquareIcon = () => (
  <Icon>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
)

export const ShieldIcon = () => (
  <Icon>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Icon>
)

export const ScrollTextIcon = () => (
  <Icon>
    <path d="M15 12h-5" />
    <path d="M15 8h-5" />
    <path d="M19 17V5a2 2 0 0 0-2-2H4" />
    <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
  </Icon>
)

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </Icon>
)

export const MoonIcon = () => (
  <Icon>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon size={16}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)

export const LogOutIcon = () => (
  <Icon size={16}>
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  </Icon>
)

export const UsersIcon = () => (
  <Icon size={16}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
)
