'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { PersonMark } from '@/lib/ui/avatar'
import { LogOutIcon } from '@/lib/ui/icons'

import { EditProfileDialog } from './edit-profile-dialog'
import { NameChangeDialog } from './name-change-dialog'
import { NotifyMenuItem } from './notify-menu-item'

/**
 * The left icon dock (JobPulse §3.1): 76px, solid white, grouped icon-only
 * items with hover labels and a hover zoom.
 *
 * The zoom is pure CSS: `.dock-item:hover .dock-scale { scale(1.32) }` on
 * the icon INSIDE the fixed 48px hit-box. Only the hovered icon moves —
 * the original cursor-distance falloff also scaled the neighbours, which
 * read as the hover landing on other buttons. prefers-reduced-motion turns
 * the zoom off in CSS; the labels still work — motion is the flourish, the
 * label is information (shown when the cursor is within 34px of an item's
 * center).
 *
 * The label is ONE fixed-position tooltip living OUTSIDE the item list,
 * so no clip/containing block can ever hide it.
 */

export type DockItem = {
  href: string
  label: string
  Icon: () => React.ReactElement
  group: 'WORK' | 'TRACK'
  /** Something is waiting here — shown as a quiet dot, never a number. */
  alert?: boolean
}

export function Dock(props: {
  items: DockItem[]
  me: {
    userId: string
    displayName: string
    roleLabel: string
    rawRoleLabel: string
  }
  isAdmin: boolean
  /** Drawer mode (mobile): item clicks close the drawer. */
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)

  // ── Tooltip (the zoom itself is pure CSS :hover on .dock-scale, so
  // only the hovered icon ever scales — neighbours stay still) ───────
  useEffect(() => {
    const list = listRef.current
    const tooltip = tooltipRef.current
    if (!list || !tooltip) return
    // Re-bind post-guard so the non-null type survives into the closures.
    const rail = list

    const items = () =>
      Array.from(rail.querySelectorAll<HTMLElement>('.dock-item'))

    function onMove(event: MouseEvent) {
      let nearest: { el: HTMLElement; rect: DOMRect } | null = null
      let nearestDist = Infinity
      for (const item of items()) {
        const rect = item.getBoundingClientRect()
        const dist = Math.abs(event.clientY - (rect.top + rect.height / 2))
        if (dist < 34 && dist < nearestDist) {
          nearestDist = dist
          nearest = { el: item, rect }
        }
      }
      if (nearest && tooltip) {
        // Anchor to the RAIL's edge so the label never jiggles.
        const railRight = rail.getBoundingClientRect().right
        tooltip.textContent = nearest.el.dataset.label ?? ''
        tooltip.style.left = `${Math.round(railRight + 14)}px`
        tooltip.style.top = `${Math.round(nearest.rect.top + nearest.rect.height / 2)}px`
        tooltip.classList.add('dock-label-show')
      } else {
        tooltip?.classList.remove('dock-label-show')
      }
    }

    function onLeave() {
      tooltip?.classList.remove('dock-label-show')
    }

    list.addEventListener('mousemove', onMove)
    list.addEventListener('mouseleave', onLeave)
    return () => {
      list.removeEventListener('mousemove', onMove)
      list.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // ── Account menu dismissal: click-away, Escape, navigation ───────
  useEffect(() => {
    if (!accountOpen) return
    function onDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountOpen])

  useEffect(() => {
    // The shell persists across navigations — close the menu when the
    // route changes. Deferred: React 19 lint, no sync setState in effects.
    queueMicrotask(() => setAccountOpen(false))
  }, [pathname])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const groups: Array<DockItem['group']> = ['WORK', 'TRACK']

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-[76px] shrink-0 flex-col items-center border-r border-border bg-surface py-3"
    >
      {/* Logo */}
      <a
        href="/app"
        aria-label="Confide — dashboard"
        onClick={props.onNavigate}
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-base font-bold text-background"
      >
        C
      </a>

      {/* No overflow here, ever: the magnification scales items past the
          box, and an auto scrollbar would pop in on hover — shifting the
          icons under the cursor and flickering. Five items always fit;
          a spacer below pins the avatar to the bottom instead. */}
      <div ref={listRef} className="flex flex-col items-center px-2">
        {groups.map((group) => {
          const members = props.items.filter((item) => item.group === group)
          if (members.length === 0) return null
          return (
            <div key={group} className="flex flex-col items-center">
              <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {group}
              </p>
              {members.map((item) => {
                const active =
                  item.href === '/app'
                    ? pathname === '/app'
                    : pathname.startsWith(item.href)
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    data-label={item.label}
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={props.onNavigate}
                    className={`dock-item relative flex h-12 w-12 items-center justify-center rounded-[10px] transition-colors ${
                      active ? 'bg-sel text-teal-t' : 'text-ink-2 hover:bg-hover'
                    }`}
                  >
                    {/* Only this inner span magnifies — the hit-box above
                        stays put, so hover/click always hit THIS button. */}
                    <span className="dock-scale flex items-center justify-center">
                      <item.Icon />
                    </span>
                    {item.alert && (
                      <span
                        className="alert-dot absolute right-2 top-2 h-2 w-2 rounded-full"
                        aria-label="needs attention"
                      />
                    )}
                  </a>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Spacer: pins the avatar to the rail's bottom */}
      <div className="flex-1" />

      {/* The one hover label — fixed, so no scroll container can clip it */}
      <span
        ref={tooltipRef}
        aria-hidden="true"
        className="dock-label fixed z-[500] whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background"
      />

      {/* Account */}
      <button
        onClick={() => setAccountOpen((v) => !v)}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        className="mt-2 rounded-full transition-transform hover:scale-105"
      >
        <PersonMark name={props.me.displayName} size={40} />
      </button>

      {accountOpen && (
        <div className="absolute bottom-3 left-full z-50 ml-2 w-56 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{props.me.displayName}</p>
            <p className="truncate text-xs text-muted">{props.me.roleLabel}</p>
          </div>
          <button
            onClick={() => {
              setAccountOpen(false)
              setRenaming(true)
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-hover"
          >
            {props.isAdmin ? 'Edit profile' : 'Request a name change'}
          </button>
          <NotifyMenuItem />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-hover"
          >
            <LogOutIcon />
            Sign out
          </button>
        </div>
      )}

      {renaming &&
        (props.isAdmin ? (
          <EditProfileDialog
            currentName={props.me.displayName}
            currentRoleLabel={props.me.rawRoleLabel}
            onClose={() => setRenaming(false)}
          />
        ) : (
          <NameChangeDialog
            currentName={props.me.displayName}
            onClose={() => setRenaming(false)}
          />
        ))}
    </div>
  )
}
