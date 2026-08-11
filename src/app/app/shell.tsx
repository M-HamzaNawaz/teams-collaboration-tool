'use client'

import { useEffect, useState } from 'react'

import {
  LayoutDashboardIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  ShieldIcon,
  UserPenIcon,
} from '@/lib/ui/icons'

import { Dock, type DockItem } from './dock'
import { QuickSwitch } from './quick-switch'
import { TopBar } from './top-bar'

/**
 * App shell (JobPulse §3): left icon dock + frosted top bar over the
 * content. One client component owns the chrome state — the off-canvas
 * dock below lg and the ⌘K quick switch — while the pages stay server
 * components passed through as children.
 */
export function AppShell(props: {
  workspaces: Array<{ id: string; name: string }>
  activeWorkspace: { id: string; name: string }
  me: { userId: string; displayName: string; roleLabel: string }
  canModerate: boolean
  isAdmin: boolean
  alerts: { moderation: boolean; names: boolean }
  groups: Array<{ id: string; name: string }>
  children: React.ReactNode
}) {
  const [dockOpen, setDockOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // ⌘K / Ctrl+K opens the quick switch anywhere in the app.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items: DockItem[] = [
    { href: '/app', label: 'Dashboard', Icon: LayoutDashboardIcon, group: 'WORK' },
    { href: '/app/chat', label: 'Chat', Icon: MessageSquareIcon, group: 'WORK' },
    ...(props.canModerate
      ? [
          {
            href: '/app/moderation',
            label: 'Moderation',
            Icon: ShieldIcon,
            group: 'TRACK' as const,
            alert: props.alerts.moderation,
          },
        ]
      : []),
    ...(props.isAdmin
      ? [
          {
            href: '/app/names',
            label: 'Names',
            Icon: UserPenIcon,
            group: 'TRACK' as const,
            alert: props.alerts.names,
          },
          {
            href: '/app/audit',
            label: 'Audit',
            Icon: ScrollTextIcon,
            group: 'TRACK' as const,
          },
        ]
      : []),
  ]

  return (
    <div className="flex h-dvh">
      {/* Dock — fixed rail from lg up */}
      <aside className="hidden h-full lg:block">
        <Dock items={items} me={props.me} />
      </aside>

      {/* Dock — off-canvas drawer below lg */}
      {dockOpen && (
        <div
          className="fixed inset-0 z-[300] flex bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setDockOpen(false)}
        >
          <div className="h-full shadow-e2" onClick={(e) => e.stopPropagation()}>
            <Dock items={items} me={props.me} onNavigate={() => setDockOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          workspaces={props.workspaces}
          activeWorkspace={props.activeWorkspace}
          me={props.me}
          alerts={props.alerts}
          onOpenDock={() => setDockOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <div className="min-h-0 flex-1">{props.children}</div>
      </div>

      {searchOpen && (
        <QuickSwitch
          pages={items.map(({ label, href }) => ({ label, href }))}
          groups={props.groups}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}
