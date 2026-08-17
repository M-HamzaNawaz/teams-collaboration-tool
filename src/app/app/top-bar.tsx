'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { GroupMark, PersonMark } from '@/lib/ui/avatar'
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
} from '@/lib/ui/icons'
import { EditProfileDialog } from './edit-profile-dialog'
import { NameChangeDialog } from './name-change-dialog'
import { NotifyMenuItem } from './notify-menu-item'
import { ThemeDialog } from './theme-dialog'
import { ThemeMenuItem } from './theme-menu-item'

/**
 * Frosted top bar (JobPulse §3.2): workspace name on the left, centered
 * ⌘K search, bell + theme + account on the right. Navigation itself lives
 * in the icon dock; below lg the dock is off-canvas behind the menu button.
 */

export function TopBar(props: {
  workspaces: Array<{ id: string; name: string }>
  activeWorkspace: { id: string; name: string }
  me: {
    userId: string
    displayName: string
    roleLabel: string
    rawRoleLabel: string
  }
  isAdmin: boolean
  alerts: { moderation: boolean; names: boolean }
  onOpenDock: () => void
  onOpenSearch: () => void
}) {
  const router = useRouter()
  const [menu, setMenu] = useState<'workspace' | 'user' | 'bell' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [theming, setTheming] = useState(false)
  const barRef = useRef<HTMLElement>(null)

  // Click-away or Escape closes any open menu.
  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!barRef.current?.contains(event.target as Node)) setMenu(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === props.activeWorkspace.id) return setMenu(null)
    await fetch('/api/workspace/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    setMenu(null)
    router.push('/app')
    router.refresh()
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const hasAlert = props.alerts.moderation || props.alerts.names

  return (
    <header
      ref={barRef}
      className="frosted relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4"
    >
      {/* Off-canvas dock trigger (below lg the dock is a drawer) */}
      <button
        onClick={props.onOpenDock}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover lg:hidden"
      >
        <MenuIcon />
      </button>

      {/* Workspace */}
      <button
        onClick={() => setMenu(menu === 'workspace' ? null : 'workspace')}
        aria-haspopup="menu"
        aria-expanded={menu === 'workspace'}
        className="flex max-w-[45vw] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover sm:max-w-none"
      >
        <span className="truncate text-sm font-semibold">
          {props.activeWorkspace.name}
        </span>
        {props.workspaces.length > 1 && <ChevronDownIcon />}
      </button>

      {menu === 'workspace' && (
        <div className="absolute left-3 top-14 w-64 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2">
          <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Workspaces
          </p>
          {props.workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => switchWorkspace(workspace.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
            >
              <GroupMark name={workspace.name} size={24} />
              <span className="flex-1 truncate">{workspace.name}</span>
              {workspace.id === props.activeWorkspace.id && (
                <span className="text-teal-t">
                  <CheckIcon />
                </span>
              )}
            </button>
          ))}
          {props.workspaces.length === 1 && (
            <p className="px-3 pb-2 text-xs text-muted">
              You belong to one workspace.
            </p>
          )}
        </div>
      )}

      {/* Search (⌘K) — opens the quick switch */}
      <div className="flex min-w-0 flex-1 justify-center px-2">
        <button
          onClick={props.onOpenSearch}
          className="flex h-9 w-full max-w-[520px] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted hover:bg-hover"
        >
          <SearchIcon />
          <span className="min-w-0 flex-1 truncate text-left">Search</span>
          <span className="hidden rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            ⌘K
          </span>
        </button>
      </div>

      {/* Bell — the dot means "something needs you"; the menu says what */}
      <button
        onClick={() => setMenu(menu === 'bell' ? null : 'bell')}
        aria-label={hasAlert ? 'Notifications — something needs attention' : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={menu === 'bell'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover"
      >
        <BellIcon />
        {hasAlert && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal-d ring-2 ring-surface" />
        )}
      </button>

      {menu === 'bell' && (
        <div className="absolute right-14 top-14 w-72 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2">
          <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            Waiting on you
          </p>
          {props.alerts.moderation && (
            <Link
              href="/app/moderation"
              onClick={() => setMenu(null)}
              className="block px-3 py-2.5 text-sm hover:bg-hover"
            >
              <span className="block font-medium">Messages held for review</span>
              <span className="block text-xs text-muted">
                Open the moderation queue →
              </span>
            </Link>
          )}
          {props.alerts.names && (
            <Link
              href="/app/names"
              onClick={() => setMenu(null)}
              className="block px-3 py-2.5 text-sm hover:bg-hover"
            >
              <span className="block font-medium">Name changes requested</span>
              <span className="block text-xs text-muted">
                Review the requests →
              </span>
            </Link>
          )}
          {!hasAlert && (
            <p className="px-3 py-4 text-center text-sm text-muted">
              You&apos;re all caught up.
            </p>
          )}
        </div>
      )}

      {/* Account */}
      <button
        onClick={() => setMenu(menu === 'user' ? null : 'user')}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={menu === 'user'}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-hover"
      >
        <span className="hidden text-sm font-medium lg:inline">
          {props.me.displayName}
        </span>
        <PersonMark name={props.me.displayName} size={26} />
      </button>

      {menu === 'user' && (
        <div className="absolute right-3 top-14 w-56 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{props.me.displayName}</p>
            <p className="truncate text-xs text-muted">{props.me.roleLabel}</p>
          </div>
          {/* The admin IS the identity authority — they edit directly.
              Everyone else asks, and an admin reviews (I2). */}
          <button
            onClick={() => {
              setMenu(null)
              setRenaming(true)
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-hover"
          >
            {props.isAdmin ? 'Edit profile' : 'Request a name change'}
          </button>
          <ThemeMenuItem
            onOpen={() => {
              setMenu(null)
              setTheming(true)
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

      {theming && <ThemeDialog onClose={() => setTheming(false)} />}
    </header>
  )
}
