'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { PersonMark } from '@/lib/ui/avatar'
import { LogOutIcon, PanelLeftIcon } from '@/lib/ui/icons'

import { EditProfileDialog } from './edit-profile-dialog'
import { NameChangeDialog } from './name-change-dialog'
import { NotifyMenuItem } from './notify-menu-item'
import { ThemeDialog } from './theme-dialog'
import { ThemeMenuItem } from './theme-menu-item'

/**
 * The dock (JobPulse §3.1, now collapsible like ChatGPT's sidebar).
 *
 * Two states, toggled by the panel button under the logo and REMEMBERED
 * per device:
 *   - collapsed: the 76px icon rail — hover zoom on the icon, one fixed
 *     tooltip for labels (it lives OUTSIDE the scroll/transform ancestry
 *     so nothing can clip it)
 *   - expanded: ~224px with icon + label rows; no tooltip, no zoom —
 *     the labels are simply there
 *
 * The mobile drawer always renders expanded: a phone drawer has the room,
 * and phone users benefit most from labels. The rail still wears the
 * THEME's color (--rail tokens) in both states.
 */

const DOCK_KEY = 'confide-dock'

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
  const [expandedPref, setExpandedPref] = useState(false)

  // The saved preference is a browser fact — read after mount.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setExpandedPref(localStorage.getItem(DOCK_KEY) === 'expanded')
      } catch {
        // Private mode — default stays collapsed.
      }
    })
  }, [])

  const expanded = props.drawer ? true : expandedPref

  function toggleExpanded() {
    setExpandedPref((current) => {
      const next = !current
      try {
        localStorage.setItem(DOCK_KEY, next ? 'expanded' : 'collapsed')
      } catch {
        // Best effort.
      }
      return next
    })
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

  const groups: Array<DockItem['group']> = ['WORK', 'TRACK']

  return (
    <div
      ref={rootRef}
      className={`relative flex h-full shrink-0 flex-col border-r border-rail-border bg-rail py-3 transition-[width] duration-200 ${
        expanded ? 'w-[232px] px-3' : 'w-[76px] items-center'
      }`}
    >
      {/* Logo row + the ChatGPT-style panel toggle */}
      <div
        className={`flex items-center ${
          expanded ? 'justify-between' : 'flex-col gap-1'
        }`}
      >
        <Link
          href="/app"
          aria-label="Confide — dashboard"
          onClick={props.onNavigate}
          className="flex items-center gap-2.5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-rail-active-fg text-base font-bold text-rail">
            C
          </span>
          {expanded && (
            <span className="text-sm font-semibold text-rail-active-fg">
              Confide
            </span>
          )}
        </Link>
        {!props.drawer && (
          <button
            onClick={toggleExpanded}
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-rail-fg hover:bg-rail-active/60"
          >
            <PanelLeftIcon />
          </button>
        )}
      </div>

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
                          className="alert-dot h-2 w-2 shrink-0 rounded-full"
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
        className="dock-label fixed z-[500] whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background"
      />

      {/* Account */}
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
  )
}
