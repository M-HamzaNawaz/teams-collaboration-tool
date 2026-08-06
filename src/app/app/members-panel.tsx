'use client'

import { useCallback, useEffect, useState } from 'react'

import { gradientStyle, initials } from '@/lib/ui/colors'

import type { Me } from './chat-shell'

/**
 * Members panel: everyone sees who is in the group (masked, via the
 * projected endpoint — M8-03); admins additionally add and remove.
 * Adding respects the one-manager-per-group index — the 409 from the
 * database surfaces as the error line.
 */

type Masked = {
  userId: string
  displayName?: string
  roleLabel?: string
  memberRole: string
}

export function MembersPanel(props: {
  groupId: string
  groupName: string
  me: Me
  onClose: () => void
}) {
  const [members, setMembers] = useState<Masked[] | null>(null)
  const [directory, setDirectory] = useState<Masked[]>([])
  const [pickId, setPickId] = useState('')
  const [pickRole, setPickRole] = useState<'member' | 'manager'>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const memberResponse = await fetch(`/api/groups/${props.groupId}/profiles`)
    if (memberResponse.ok) {
      const data = (await memberResponse.json()) as { profiles: Masked[] }
      setMembers(data.profiles)
    }
    if (props.me.isAdmin) {
      const directoryResponse = await fetch('/api/workspace/profiles')
      if (directoryResponse.ok) {
        const data = (await directoryResponse.json()) as { profiles: Masked[] }
        setDirectory(data.profiles)
      }
    }
  }, [props.groupId, props.me.isAdmin])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const memberIds = new Set((members ?? []).map((m) => m.userId))
  const addable = directory.filter((p) => !memberIds.has(p.userId))

  async function addMember(event: React.FormEvent) {
    event.preventDefault()
    if (!pickId || busy) return
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/groups/${props.groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pickId, role: pickRole }),
    })
    if (response.status === 201) {
      setPickId('')
      setPickRole('member')
      await load()
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? 'could not add the member')
    }
    setBusy(false)
  }

  async function removeMember(userId: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    const response = await fetch(
      `/api/groups/${props.groupId}/members/${userId}`,
      { method: 'DELETE' },
    )
    if (response.ok) {
      await load()
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? 'could not remove the member')
    }
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30"
      onClick={props.onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col border-l border-border bg-surface shadow-xl"
      >
        <header className="flex items-center gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">Members</h2>
            <p className="truncate text-xs text-muted">{props.groupName}</p>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close members panel"
            className="rounded-lg p-2 hover:bg-surface-2"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {members === null ? (
            <div className="flex flex-col gap-2">
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 rounded-xl px-2 py-2"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={gradientStyle(member.userId)}
                  >
                    {initials(member.displayName ?? 'M')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {member.displayName ?? 'Member'}
                      {member.userId === props.me.userId && (
                        <span className="text-muted"> (you)</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {member.roleLabel ?? member.memberRole}
                    </span>
                  </span>
                  {props.me.isAdmin && member.userId !== props.me.userId && (
                    <button
                      onClick={() => void removeMember(member.userId)}
                      disabled={busy}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {props.me.isAdmin && (
          <form
            onSubmit={addMember}
            className="pb-safe flex flex-col gap-2 border-t border-border p-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Add a member
            </p>
            <select
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose a person…</option>
              {addable.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName ?? 'Member'} · {p.roleLabel || p.memberRole}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={pickRole}
                onChange={(e) => setPickRole(e.target.value as 'member' | 'manager')}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
              </select>
              <button
                type="submit"
                disabled={busy || !pickId}
                className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-a), var(--brand-b))' }}
              >
                {busy ? '…' : 'Add to group'}
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </form>
        )}
      </aside>
    </div>
  )
}
