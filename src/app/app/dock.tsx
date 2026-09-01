'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { PersonMark } from '@/lib/ui/avatar'
import { LogOutIcon, PanelLeftIcon, XIcon } from '@/lib/ui/icons'

import { EditProfileDialog } from './edit-profile-dialog'
import { NameChangeDialog } from './name-change-dialog'
import { NotifyMenuItem } from './notify-menu-item'
import { ThemeDialog } from './theme-dialog'
import { ThemeMenuItem } from './theme-menu-item'

/**
 * The dock (JobPulse §3.1) — works like ChatGPT's sidebar:
 *
 *   - collapsed rail (76px): hovering it slides the labeled sidebar out
 *     AS AN OVERLAY — the page content does not move — and it tucks back
 *     when the mouse leaves
 *   - the panel button PINS it open: the layout widens and it stays,
 *     remembered per device
 *   - pinned → click again to collapse back to the rail
 *
 * The rail keeps its hover zoom + fixed tooltip ONLY when truly collapsed
 * (during hover-expand and pinned states the labels are simply there).
 * The mobile drawer always renders expanded. The rail wears the THEME's
 * color (--rail tokens) in every state.
 */

const DOCK_KEY = 'confide-dock'

export type DockItem = {
  href: string
  label: string
  Icon: () => React.ReactElement
  group: 'WORK' | 'TRACK' | 'APPS'
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
  /** Drawer mode (mobile): always expanded; item clicks close the drawer. */
  drawer?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [pickingTheme, setPickingTheme] = useState(false)
  const [pinned, setPinned] = useState(false)
  // Cursor-presence flag: while the pointer is on the rail, the C logo
  // swaps to the expand icon. Hover changes NOTHING else — expanding is
  // an explicit click, so the sidebar never opens by accident.
  const [railHovered, setRailHovered] = useState(false)

  // The saved preference is a browser fact — read after mount.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setPinned(localStorage.getItem(DOCK_KEY) === 'expanded')
      } catch {
        // Private mode — default stays collapsed.
      }
    })
  }, [])

  const expanded = props.drawer ? true : pinned

  function togglePinned() {
    setPinned((current) => {
      const next = !current
      try {
        localStorage.setItem(DOCK_KEY, next ? 'expanded' : 'collapsed')
      } catch {
        // Best effort.
      }
      return next
    })
  }

  function onRailEnter() {
    setRailHovered(true)
  }
  function onRailLeave() {
    setRailHovered(false)
  }

  // ── Tooltip (collapsed only; the zoom itself is pure CSS :hover) ────
  useEffect(() => {
    if (expanded) return
    const list = listRef.current
    const tooltip = tooltipRef.current
    if (!list || !tooltip) return
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
  }, [expanded])

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

  const groups: Array<DockItem['group']> = ['WORK', 'TRACK', 'APPS']

  return (
    // Outer shell reserves LAYOUT width (76px unless pinned) — the sidebar
    // itself is absolutely positioned, so hover-expansion overlays the page
    // instead of pushing it (the ChatGPT behaviour).
    <div
      ref={rootRef}
      onMouseEnter={onRailEnter}
      onMouseLeave={onRailLeave}
      className={`relative h-full shrink-0 transition-[width] duration-200 ${
        props.drawer || pinned ? 'w-58' : 'w-19'
      }`}
    >
    <div
      className={`absolute inset-y-0 left-0 z-50 flex h-full flex-col border-r border-rail-border bg-rail py-3 transition-[width] duration-200 ${
        expanded ? 'w-58 px-3' : 'w-19 items-center'
      }`}
    >
      {/* Header. Expanded: logo + name with the pin toggle at the right.
          Collapsed: ONE slot — the C at rest, and the moment the cursor is
          on the rail it becomes the expand button (ChatGPT's logo swap). */}
      {expanded ? (
        <div className="flex items-center justify-between">
          <Link
            href="/app"
            aria-label="Confide — dashboard"
            onClick={props.onNavigate}
            className="flex items-center gap-2.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-rail-active-fg text-base font-bold text-rail">
              C
            </span>
            <span className="text-sm font-semibold text-rail-active-fg">
              Confide
            </span>
          </Link>
          {props.drawer ? (
            // Mobile drawer: an explicit close — tapping the scrim works
            // too, but a visible X shouldn't have to be discovered.
            <button
              onClick={props.onNavigate}
              aria-label="Close navigation"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-rail-fg hover:bg-rail-active/60"
            >
              <XIcon />
            </button>
          ) : (
            <button
              onClick={togglePinned}
              aria-label={pinned ? 'Collapse navigation' : 'Pin navigation open'}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-rail-fg hover:bg-rail-active/60"
            >
              <PanelLeftIcon />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={togglePinned}
          aria-label="Expand navigation"
          className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors ${
            railHovered
              ? 'text-rail-fg hover:bg-rail-active/60'
              : 'bg-rail-active-fg text-base font-bold text-rail'
          }`}
        >
          {railHovered ? <PanelLeftIcon /> : 'C'}
        </button>
      )}

      <div
        ref={listRef}
        className={`flex flex-col ${expanded ? 'items-stretch' : 'items-center'}`}
      >
        {groups.map((group) => {
          const members = props.items.filter((item) => item.group === group)
          if (members.length === 0) return null
          return (
            <div
              key={group}
              className={`flex flex-col ${
                expanded ? 'items-stretch' : 'items-center'
              }`}
            >
              <p
                className={`mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-rail-fg/70 ${
                  expanded ? 'px-3' : ''
                }`}
              >
                {group}
              </p>
              {members.map((item) => {
                const active =
                  item.href === '/app'
                    ? pathname === '/app'
                    : pathname.startsWith(item.href)
                return (
                  // next/link: client-side navigation + prefetch — a dock
                  // click swaps the page, never reloads the whole app.
                  <Link
                    key={item.href}
                    href={item.href}
                    data-label={item.label}
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={props.onNavigate}
                    className={`dock-item relative flex items-center rounded-[10px] transition-colors ${
                      expanded
                        ? 'h-11 w-full gap-3 px-3'
                        : 'h-12 w-12 justify-center'
                    } ${
                      active
                        ? 'bg-rail-active text-rail-active-fg'
                        : 'text-rail-fg hover:bg-rail-active/60'
                    }`}
                  >
                    {/* Only this inner span magnifies (collapsed rail) — the
                        hit-box stays put, so hover/click always hit THIS
                        button. Expanded rows don't zoom. */}
                    <span
                      className={`${expanded ? '' : 'dock-scale'} flex shrink-0 items-center justify-center`}
                    >
                      <item.Icon />
                    </span>
                    {expanded && (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {item.label}
                      </span>
                    )}
                    {item.alert &&
                      (expanded ? (
                        <span
                          // `relative` is load-bearing: .alert-dot::after is
                          // inset-0 absolute, so without a positioned dot it
                          // resolves against the row (.dock-item relative) and
                          // the "ping" becomes a 207x44 red pill scaling to
                          // 497x106 — across the row and out over the page.
                          // The collapsed rail's dot is already `absolute`,
                          // which is why this only showed when expanded.
                          className="alert-dot relative h-2 w-2 shrink-0 rounded-full"
                          aria-label="needs attention"
                        />
                      ) : (
                        <span
                          className="alert-dot absolute right-2 top-2 h-2 w-2 rounded-full"
                          aria-label="needs attention"
                        />
                      ))}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Spacer: pins the account section to the rail's bottom */}
      <div className="flex-1" />

      {/* The one hover label — fixed, so no scroll container can clip it */}
      <span
        ref={tooltipRef}
        aria-hidden="true"
        className="dock-label fixed z-500 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background"
      />

      {/* Account. The drawer fills most of a phone screen, so its menu
          opens UPWARD inside the rail; the desktop rail keeps hanging it
          off the right edge — `contents` leaves that path's layout alone. */}
      <div className={props.drawer ? 'relative w-full' : 'contents'}>
      <button
        onClick={() => setAccountOpen((v) => !v)}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        className={
          expanded
            ? 'flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left hover:bg-rail-active/60'
            : 'mt-2 rounded-full transition-transform hover:scale-105'
        }
      >
        <PersonMark name={props.me.displayName} size={expanded ? 32 : 40} />
        {expanded && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-rail-active-fg">
              {props.me.displayName}
            </span>
            <span className="block truncate text-xs text-rail-fg">
              {props.me.roleLabel}
            </span>
          </span>
        )}
      </button>

      {accountOpen && (
        <div
          className={`absolute z-50 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2 ${
            props.drawer
              ? // 232px rail on a 360px phone: hung off the right edge the
                // menu lands off-screen, so open it above, rail-width.
                'inset-x-0 bottom-full mb-2'
              : 'bottom-3 left-full ml-2 w-56'
          }`}
        >
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
          <ThemeMenuItem
            onOpen={() => {
              setAccountOpen(false)
              setPickingTheme(true)
            }}
          />
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
      </div>

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
      {pickingTheme && <ThemeDialog onClose={() => setPickingTheme(false)} />}
    </div>
    </div>
  )
}
