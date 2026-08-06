'use client'

import gsap from 'gsap'
import { useEffect, useRef } from 'react'

import type { GroupRow } from '@/lib/types'
import { gradientStyle, initials } from '@/lib/ui/colors'

import { LogoutButton } from './logout-button'
import type { Me } from './chat-shell'

/**
 * Sidebar (M5-03): workspace header, the caller's groups (each with its
 * deterministic gradient), and the signed-in identity. Groups arrive
 * server-rendered — the stagger entrance is polish, not a loading state.
 */
export function GroupList(props: {
  groups: GroupRow[]
  workspaceName: string
  me: Me
  selectedId: string | null
  onSelect: (group: GroupRow) => void
  unreadByGroup: Record<string, number>
  moderation: { pendingCount: number } | null
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-anim="group-item"]', {
        y: 12,
        opacity: 0,
        duration: 0.35,
        stagger: 0.05,
        ease: 'power2.out',
        delay: 0.2,
      })
    }, listRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={listRef} className="flex h-full flex-col">
      {/* Workspace header */}
      <header className="flex items-center gap-3 border-b border-border p-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
          }}
        >
          {initials(props.workspaceName)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{props.workspaceName}</h1>
          <p className="truncate text-xs text-muted">Confide workspace</p>
        </div>
      </header>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto p-2">
        <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
          Groups
        </p>
        {props.groups.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted">
            No groups yet — your admin adds you when a project starts.
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
          {props.groups.map((group) => {
            const active = group.id === props.selectedId
            return (
              <li key={group.id} data-anim="group-item">
                <button
                  onClick={() => props.onSelect(group)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                    active ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                  }`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm transition-transform group-hover:scale-105"
                    style={gradientStyle(group.id)}
                  >
                    {initials(group.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {group.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {active ? 'Open' : 'Tap to open'}
                    </span>
                  </span>
                  {/* Unread badge (M6-05) — counts by delivered_at, so a
                      released-after-review message drives it too. */}
                  {(props.unreadByGroup[group.id] ?? 0) > 0 && !active && (
                    <span
                      className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                      style={gradientStyle(group.id)}
                    >
                      {props.unreadByGroup[group.id]}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Moderation entry (M6-01) — admins and group managers only */}
      {props.moderation && (
        <a
          href="/app/moderation"
          className="mx-2 mb-2 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-surface-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hold/15 text-sm">
            🛡
          </span>
          <span className="flex-1 text-sm font-medium">Moderation</span>
          {props.moderation.pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-hold px-1.5 text-[11px] font-bold text-white">
              {props.moderation.pendingCount}
            </span>
          )}
        </a>
      )}

      {/* Me */}
      <footer className="flex items-center gap-3 border-t border-border p-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={gradientStyle(props.me.userId)}
        >
          {initials(props.me.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{props.me.displayName}</p>
          <p className="truncate text-xs text-muted">{props.me.roleLabel}</p>
        </div>
        <LogoutButton />
      </footer>
    </div>
  )
}
