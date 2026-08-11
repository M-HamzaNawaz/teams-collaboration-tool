'use client'

import gsap from 'gsap'
import { useEffect, useRef } from 'react'

import type { GroupRow } from '@/lib/types'
import { GroupMark } from '@/lib/ui/avatar'
import { prefersReducedMotion } from '@/lib/ui/dismiss'

import type { Me } from './chat-shell'

/**
 * Sidebar card (JobPulse §4.2): purely the caller's group list. Selected
 * row carries the teal selection tint; unread counts are teal mono pills.
 * Navigation, identity and group CREATION all live outside this pane.
 */
export function GroupList(props: {
  groups: GroupRow[]
  workspaceName: string
  me: Me
  selectedId: string | null
  onSelect: (group: GroupRow) => void
  unreadByGroup: Record<string, number>
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
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
      <header className="flex items-center gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">Conversations</h1>
          <p className="truncate text-xs text-muted">{props.workspaceName}</p>
        </div>
      </header>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <div className="flex items-center justify-between px-2 pb-1 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Groups
          </p>
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
                  className={`group flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors ${
                    active ? 'bg-sel' : 'hover:bg-rowhover'
                  } ${group.status === 'archived' ? 'opacity-60' : ''}`}
                >
                  <GroupMark name={group.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${
                        active ? 'text-teal-t' : ''
                      }`}
                    >
                      {group.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {group.status === 'archived'
                        ? 'Archived · read-only'
                        : active
                          ? 'Open'
                          : 'Tap to open'}
                    </span>
                  </span>
                  {/* Unread badge (M6-05) — counts by delivered_at, so a
                      released-after-review message drives it too. */}
                  {(props.unreadByGroup[group.id] ?? 0) > 0 && !active && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal px-1.5 font-mono text-[11px] font-semibold tabular-nums text-[#1a1a1a]">
                      {props.unreadByGroup[group.id]}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
