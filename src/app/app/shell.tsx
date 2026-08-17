'use client'

import { useEffect, useState } from 'react'

import { PresenceProvider } from '@/lib/presence/presence'
import { localTheme, useApplyServerTheme } from '@/lib/theme/apply'
import { isValidTheme } from '@/lib/theme/themes'
import {
  LayoutDashboardIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  ShieldIcon,
  UserPenIcon,
} from '@/lib/ui/icons'

import { Dock, type DockItem } from './dock'
import { NotificationCenter } from './notification-center'
import { QuickSwitch } from './quick-switch'
import { ThemeDialog } from './theme-dialog'
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
  me: {
    userId: string
    displayName: string
    roleLabel: string
    rawRoleLabel: string
    theme: string | null
  }
  canModerate: boolean
  isAdmin: boolean
  alerts: { moderation: boolean; names: boolean }
  groups: Array<{ id: string; name: string }>
  children: React.ReactNode
}) {
  const [dockOpen, setDockOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // First-login theme picker: only when there is no choice ANYWHERE — the DB
  // hasn't got one AND this device has none saved. Checking localStorage too
  // keeps the picker from reappearing when a save raced the page load.
  const [pickingTheme, setPickingTheme] = useState(false)

  // New device: adopt the DB theme. Same device: keep the local choice.
  useApplyServerTheme(props.me.theme)

  useEffect(() => {
    queueMicrotask(() => {
      setPickingTheme(!isValidTheme(props.me.theme) && !localTheme())
    })
  }, [props.me.theme])

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
    // The dashboard is the admin's control surface — members and clients
    // land in the chat (the /app route redirects them there too).
    ...(props.isAdmin
      ? [
          {
            href: '/app',
            label: 'Dashboard',
            Icon: LayoutDashboardIcon,
            group: 'WORK' as const,
          },
        ]
      : []),
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
    <PresenceProvider
      workspaceId={props.activeWorkspace.id}
      me={{ userId: props.me.userId }}
    >
      <div className="flex h-dvh">
      {/* Dock — fixed rail from lg up */}
      <aside className="hidden h-full lg:block">
        <Dock items={items} me={props.me} isAdmin={props.isAdmin} />
      </aside>

      {/* Dock — off-canvas drawer below lg */}
      {dockOpen && (
        <div
          className="overlay-in fixed inset-0 z-[300] flex bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setDockOpen(false)}
        >
          <div
            className="panel-in-left h-full shadow-e2"
            onClick={(e) => e.stopPropagation()}
          >
            <Dock
              items={items}
              me={props.me}
              isAdmin={props.isAdmin}
              drawer
              onNavigate={() => setDockOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          workspaces={props.workspaces}
          activeWorkspace={props.activeWorkspace}
          me={props.me}
          isAdmin={props.isAdmin}
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

      {/* Desktop notifications — behaviour only, listens across all groups */}
      <NotificationCenter me={{ userId: props.me.userId }} groups={props.groups} />

      {/* First-login: choose a theme (dismiss = keep whatever is applied) */}
      {pickingTheme && (
        <ThemeDialog firstRun onClose={() => setPickingTheme(false)} />
      )}
      </div>
    </PresenceProvider>
  )
}
