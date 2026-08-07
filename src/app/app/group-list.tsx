'use client'

import gsap from 'gsap'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { gradientStyle, initials } from '@/lib/ui/colors'

import { ThemeToggle } from '@/lib/ui/theme-toggle'

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
  onGroupCreated?: (group: GroupRow) => void
  unreadByGroup: Record<string, number>
  moderation: { pendingCount: number } | null
  auditLink?: boolean
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  // I1: creating a group is the ONLY way a conversation starts, and only
  // the admin gets the affordance — everyone else has no button at all.
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function createGroup(event: React.FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (name.length < 2 || busy) return
    setBusy(true)
    setCreateError(null)
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (response.status === 201) {
      const { group } = (await response.json()) as { group: GroupRow }
      setNewName('')
      setCreating(false)
      props.onGroupCreated?.(group)
      router.refresh()
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setCreateError(data?.error ?? 'could not create the group')
    }
    setBusy(false)
  }

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
      {/* Workspace header — the theme toggle lives TOP-RIGHT here, matching
          its position on every other page (auth corner, moderation and
          audit headers). One place, everywhere. */}
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
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{props.workspaceName}</h1>
          <p className="truncate text-xs text-muted">Confide workspace</p>
        </div>
        <ThemeToggle />
      </header>

      {/* Groups */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 pb-1 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Groups
          </p>
          {props.me.isAdmin && !creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg px-2 py-0.5 text-xs font-semibold text-brand-a hover:bg-surface-2"
            >
              + New group
            </button>
          )}
        </div>
        {creating && (
          <form onSubmit={createGroup} className="mb-2 flex flex-col gap-1.5 px-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              placeholder="Group name (e.g. Client — Website)"
              minLength={2}
              maxLength={80}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-a"
            />
            {createError && <p className="text-xs text-danger">{createError}</p>}
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={busy || newName.trim().length < 2}
                className="flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-a), var(--brand-b))' }}
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-xl border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
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

      {/* Audit log (M9-02) — admins only */}
      {props.auditLink && (
        <a
          href="/app/audit"
          className="mx-2 mb-2 flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-surface-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-a/15 text-sm">
            📜
          </span>
          <span className="flex-1 text-sm font-medium">Audit log</span>
        </a>
      )}

      {/* Me */}
      <footer className="pb-safe flex items-center gap-3 border-t border-border p-3">
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
