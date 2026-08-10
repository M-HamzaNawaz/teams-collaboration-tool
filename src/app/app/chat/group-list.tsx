'use client'

import gsap from 'gsap'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { gradientStyle, initials } from '@/lib/ui/colors'

import { CreateGroupDialog } from '../create-group-dialog'
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
  onGroupCreated?: (group: GroupRow) => void
  unreadByGroup: Record<string, number>
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  // I1: creating a group is the ONLY way a conversation starts, and only
  // the admin gets the affordance — everyone else has no button at all.
  const [creating, setCreating] = useState(false)

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
      {/* Sidebar header: this pane is now purely the group list — app
          navigation, workspace, theme and identity all live in the top bar. */}
      <header className="flex items-center gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">Conversations</h1>
          <p className="truncate text-xs text-muted">{props.workspaceName}</p>
        </div>
      </header>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 pb-1 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Groups
          </p>
          {props.me.isAdmin && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg px-2 py-0.5 text-xs font-semibold text-brand-a hover:bg-surface-2"
            >
              + New group
            </button>
          )}
        </div>
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

      {creating && (
        <CreateGroupDialog
          onClose={() => setCreating(false)}
          onCreated={(group) => {
            props.onGroupCreated?.(group)
            router.refresh()
          }}
        />
      )}



    </div>
  )
}
