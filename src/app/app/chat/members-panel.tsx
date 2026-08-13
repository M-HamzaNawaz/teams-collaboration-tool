'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useOnlineUsers } from '@/lib/presence/presence'
import { PersonMark } from '@/lib/ui/avatar'
import { prefersReducedMotion, useEscape } from '@/lib/ui/dismiss'

import { InviteDialog } from '../invite-dialog'
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
  const [inviting, setInviting] = useState(false)
  const onlineUsers = useOnlineUsers()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closing = useRef(false)

  // Entrance is CSS (.overlay-in/.panel-in); the EXIT slides the panel
  // back out before unmounting — closing must feel like the open, reversed.
  const { onClose } = props
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (prefersReducedMotion() || !overlayRef.current || !panelRef.current) {
      onClose()
      return
    }
    gsap
      .timeline({ onComplete: onClose })
      .to(panelRef.current, { x: '100%', duration: 0.22, ease: 'power2.in' })
      .to(overlayRef.current, { opacity: 0, duration: 0.18 }, '<')
  }, [onClose])

  useEscape(close)

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
      ref={overlayRef}
      className="overlay-in fixed inset-0 z-[300] flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={close}
    >
      <aside
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="members-panel-title"
        className="panel-in flex h-full w-full max-w-sm flex-col border-l border-border bg-surface shadow-e2"
      >
        <header className="flex items-center gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h2 id="members-panel-title" className="truncate font-semibold">Members</h2>
            <p className="truncate text-xs text-muted">{props.groupName}</p>
          </div>
          <button
            onClick={close}
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
                  <PersonMark
                    name={member.displayName ?? 'M'}
                    size={34}
                    online={onlineUsers.has(member.userId)}
                  />
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
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
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
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
              </select>
              <button
                type="submit"
                disabled={busy || !pickId}
                className="btn btn-primary flex-1"
              >
                {busy ? '…' : 'Add to group'}
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="button"
              onClick={() => setInviting(true)}
              className="btn btn-secondary"
            >
              + Invite someone new by email
            </button>
          </form>
        )}

        {inviting && (
          <InviteDialog
            groupId={props.groupId}
            groupName={props.groupName}
            onClose={() => setInviting(false)}
            onInvited={load}
          />
        )}
      </aside>
    </div>
  )
}
