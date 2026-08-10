'use client'

import gsap from 'gsap'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { MemberRole } from '@/lib/types'
import { accentFor, gradientStyle, initials } from '@/lib/ui/colors'

import { InviteDialog } from './invite-dialog'

export type DashboardData = {
  role: MemberRole
  displayName: string
  groups: Array<{ id: string; name: string; unread: number; isManager: boolean }>
  myPendingCount: number
  oversight: {
    pendingCount: number
    scope: 'workspace' | 'groups'
    flagged7d: number
    blocked7d: number
    autoApproved7d: number
    memberCount: number
    activeGroupCount: number
    archivedCount: number
    chain: { ok: boolean; checkedAt: string } | null
    recent: Array<{ id: number; actor: string; event: string; group: string; at: string }>
  } | null
}

export function Dashboard(props: { data: DashboardData }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inviting, setInviting] = useState(false)
  const { data } = props

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-card]', {
        y: 14,
        opacity: 0,
        duration: 0.35,
        stagger: 0.05,
        ease: 'power2.out',
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  )

  const totalUnread = data.groups.reduce((sum, g) => sum + g.unread, 0)
  const greeting = data.displayName.split(' ')[0]

  return (
    <div ref={ref} className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <header className="mb-5 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">Hello, {greeting}</h1>
            <p className="text-sm text-muted">
              {data.oversight
                ? data.oversight.scope === 'workspace'
                  ? "Here's what's happening across the workspace."
                  : "Here's what needs you in the groups you manage."
                : "Here's where your conversations stand."}
            </p>
          </div>
          {data.role === 'admin' && (
            <button
              onClick={() => setInviting(true)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
              }}
            >
              + Invite people
            </button>
          )}
        </header>

        {inviting && <InviteDialog onClose={() => setInviting(false)} />}

        {/* ── Stat row ─────────────────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.oversight && (
            <StatCard
              label={
                data.oversight.scope === 'workspace'
                  ? 'Awaiting review'
                  : 'Awaiting your review'
              }
              value={data.oversight.pendingCount}
              tone={data.oversight.pendingCount > 0 ? 'hold' : 'plain'}
              href="/app/moderation"
              hint={
                data.oversight.pendingCount > 0
                  ? 'Held until someone decides'
                  : 'Queue is clear'
              }
            />
          )}
          <StatCard
            label="Unread messages"
            value={totalUnread}
            href="/app/chat"
            hint={totalUnread > 0 ? 'Across your groups' : 'All caught up'}
          />
          {data.oversight?.scope === 'workspace' ? (
            <>
              <StatCard
                label="Caught this week"
                value={data.oversight.flagged7d}
                hint={`${data.oversight.blocked7d} blocked · ${data.oversight.autoApproved7d} auto-released`}
              />
              <StatCard
                label="People"
                value={data.oversight.memberCount}
                hint={`${data.oversight.activeGroupCount} active groups`}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Your groups"
                value={data.groups.length}
                href="/app/chat"
                hint="Created by your admin"
              />
              <StatCard
                label="Your messages in review"
                value={data.myPendingCount}
                tone={data.myPendingCount > 0 ? 'hold' : 'plain'}
                hint={
                  data.myPendingCount > 0
                    ? 'Waiting on an admin'
                    : 'Nothing held'
                }
              />
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* ── Groups ─────────────────────────────────────────────── */}
          <section
            data-card
            className="rounded-2xl border border-border bg-surface p-4 lg:col-span-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Your groups</h2>
              <a href="/app/chat" className="text-sm text-brand-a hover:underline">
                Open chat →
              </a>
            </div>
            {data.groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No groups yet — your admin adds you when a project starts.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.groups.slice(0, 8).map((group) => (
                  <li key={group.id}>
                    <a
                      href="/app/chat"
                      className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white"
                        style={gradientStyle(group.id)}
                      >
                        {initials(group.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {group.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {group.isManager ? 'You manage this group' : 'Member'}
                        </span>
                      </span>
                      {group.unread > 0 && (
                        <span
                          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                          style={gradientStyle(group.id)}
                        >
                          {group.unread}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Right column ───────────────────────────────────────── */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {data.oversight?.scope === 'workspace' && (
              <section
                data-card
                className={`rounded-2xl border p-4 ${
                  data.oversight.chain && !data.oversight.chain.ok
                    ? 'border-danger bg-danger/10'
                    : 'border-border bg-surface'
                }`}
              >
                <h2 className="mb-1 font-semibold">Evidence chain</h2>
                {data.oversight.chain === null ? (
                  <p className="text-sm text-muted">
                    Not verified yet — runs nightly, or check it now.
                  </p>
                ) : data.oversight.chain.ok ? (
                  <p className="text-sm text-muted">
                    🔒 Verified intact ·{' '}
                    {timeFormat.format(new Date(data.oversight.chain.checkedAt))}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-danger">
                    🚨 Chain broken — open the audit log now.
                  </p>
                )}
                <a
                  href="/app/audit"
                  className="mt-2 inline-block text-sm text-brand-a hover:underline"
                >
                  Open audit log →
                </a>
              </section>
            )}

            {data.oversight?.scope === 'workspace' && (
              <section
                data-card
                className="min-h-0 flex-1 rounded-2xl border border-border bg-surface p-4"
              >
                <h2 className="mb-2 font-semibold">Recent activity</h2>
                {data.oversight.recent.length === 0 ? (
                  <p className="text-sm text-muted">Nothing recorded yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.oversight.recent.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2 text-sm">
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ background: accentFor(entry.actor) }}
                        >
                          {initials(entry.actor)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{entry.actor}</span>{' '}
                          <span className="font-mono text-xs text-brand-a">
                            {entry.event}
                          </span>
                          {entry.group && (
                            <span className="text-muted"> · {entry.group}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {!data.oversight && (
              <section
                data-card
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <h2 className="mb-1 font-semibold">How this workspace works</h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
                  <li>• Messages are screened for contact details before delivery.</li>
                  <li>• A held message waits for an admin — you always see its status.</li>
                  <li>• Your admin creates groups and adds people.</li>
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard(props: {
  label: string
  value: number
  hint?: string
  href?: string
  tone?: 'hold' | 'plain'
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {props.label}
      </p>
      <p
        className={`mt-1 text-3xl font-semibold ${
          props.tone === 'hold' ? 'text-hold' : ''
        }`}
      >
        {props.value}
      </p>
      {props.hint && <p className="mt-0.5 text-xs text-muted">{props.hint}</p>}
    </>
  )
  const className = `rounded-2xl border p-4 ${
    props.tone === 'hold' ? 'border-hold/50 bg-hold/5' : 'border-border bg-surface'
  } ${props.href ? 'transition-colors hover:bg-surface-2' : ''}`

  return props.href ? (
    <a data-card href={props.href} className={className}>
      {body}
    </a>
  ) : (
    <div data-card className={className}>
      {body}
    </div>
  )
}
