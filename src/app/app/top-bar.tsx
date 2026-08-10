'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { gradientStyle, initials } from '@/lib/ui/colors'
import {
  CheckIcon,
  ChevronDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  ShieldIcon,
  UserPenIcon,
} from '@/lib/ui/icons'
import { ThemeToggle } from '@/lib/ui/theme-toggle'

import { NameChangeDialog } from './name-change-dialog'

/**
 * The app's only global chrome (48px): workspace switcher · navigation ·
 * theme · identity. Labels collapse to icons under md so the bar never
 * steals height or wraps on a phone.
 */

type NavItem = {
  href: string
  label: string
  Icon: () => React.ReactElement
  show: boolean
  /** Something is waiting here — shown as a quiet dot, never a number. */
  alert?: boolean
}

export function TopBar(props: {
  workspaces: Array<{ id: string; name: string }>
  activeWorkspace: { id: string; name: string }
  me: { userId: string; displayName: string; roleLabel: string }
  canModerate: boolean
  isAdmin: boolean
  alerts: { moderation: boolean; names: boolean }
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menu, setMenu] = useState<'workspace' | 'user' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const barRef = useRef<HTMLElement>(null)

  // Click-away closes any open menu.
  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!barRef.current?.contains(event.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const nav: NavItem[] = [
    { href: '/app', label: 'Dashboard', Icon: LayoutDashboardIcon, show: true },
    { href: '/app/chat', label: 'Chat', Icon: MessageSquareIcon, show: true },
    {
      href: '/app/moderation',
      label: 'Moderation',
      Icon: ShieldIcon,
      show: props.canModerate,
      alert: props.alerts.moderation,
    },
    {
      href: '/app/names',
      label: 'Names',
      Icon: UserPenIcon,
      show: props.isAdmin,
      alert: props.alerts.names,
    },
    { href: '/app/audit', label: 'Audit', Icon: ScrollTextIcon, show: props.isAdmin },
  ].filter((item) => item.show)

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

  return (
    <header
      ref={barRef}
      className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 sm:px-3"
    >
      {/* Workspace switcher */}
      <button
        onClick={() => setMenu(menu === 'workspace' ? null : 'workspace')}
        className="flex max-w-[45vw] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 sm:max-w-none"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
          }}
        >
          {initials(props.activeWorkspace.name)}
        </span>
        {/* Name hides on phones — the initials mark identifies the
            workspace, and tapping opens the switcher with full names. */}
        <span className="hidden truncate text-sm font-semibold sm:inline">
          {props.activeWorkspace.name}
        </span>
        {props.workspaces.length > 1 && <ChevronDownIcon />}
      </button>

      {menu === 'workspace' && (
        <div className="absolute left-2 top-12 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Workspaces
          </p>
          {props.workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => switchWorkspace(workspace.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white"
                style={gradientStyle(workspace.id)}
              >
                {initials(workspace.name)}
              </span>
              <span className="flex-1 truncate">{workspace.name}</span>
              {workspace.id === props.activeWorkspace.id && (
                <span className="text-brand-b">
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

      <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

      {/* Navigation */}
      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {nav.map((item) => {
          const active =
            item.href === '/app'
              ? pathname === '/app'
              : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-surface-2 font-semibold text-foreground'
                  : 'text-muted hover:bg-surface-2/60'
              }`}
            >
              <span className="relative flex">
                <item.Icon />
                {item.alert && (
                  <span
                    className="alert-dot absolute -right-1 -top-0.5 h-2 w-2 rounded-full"
                    aria-label="needs attention"
                  />
                )}
              </span>
              <span className="hidden md:inline">{item.label}</span>
            </a>
          )
        })}
      </nav>

      <ThemeToggle />

      {/* Identity */}
      <button
        onClick={() => setMenu(menu === 'user' ? null : 'user')}
        aria-label="Account menu"
        className="ml-0.5 flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={gradientStyle(props.me.userId)}
        >
          {initials(props.me.displayName)}
        </span>
        <span className="hidden text-sm lg:inline">{props.me.displayName}</span>
      </button>

      {menu === 'user' && (
        <div className="absolute right-2 top-12 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">
              {props.me.displayName}
            </p>
            <p className="truncate text-xs text-muted">{props.me.roleLabel}</p>
          </div>
          <button
            onClick={() => {
              setMenu(null)
              setRenaming(true)
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
          >
            Request a name change
          </button>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-2"
          >
            <LogOutIcon />
            Sign out
          </button>
        </div>
      )}

      {renaming && (
        <NameChangeDialog
          currentName={props.me.displayName}
          onClose={() => setRenaming(false)}
        />
      )}
    </header>
  )
}
