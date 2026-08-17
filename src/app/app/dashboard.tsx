'use client'

import gsap from 'gsap'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { MemberRole } from '@/lib/types'
import { GroupMark, PersonMark } from '@/lib/ui/avatar'
import { ArrowRightIcon, LockIcon } from '@/lib/ui/icons'
import { PageHeader } from '@/lib/ui/page-header'

import { CreateGroupDialog } from './create-group-dialog'
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
  const router = useRouter()
  const [inviting, setInviting] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const { data } = props

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const ctx = gsap.context(() => {
      if (!reduced) {
        // Entrance: fade-rise with a stagger (JobPulse §5).
        gsap.from('[data-av]', {
          y: 16,
          opacity: 0,
          duration: 0.35,
          stagger: 0.06,
          ease: 'power2.out',
        })
      }
      // KPI count-up: every [data-count] tweens 0 → target in mono.
      for (const el of Array.from(
        ref.current?.querySelectorAll<HTMLElement>('[data-count]') ?? [],
      )) {
        const target = Number(el.dataset.count ?? '0')
        if (reduced || target === 0) {
          el.textContent = target.toLocaleString()
          continue
        }
        const state = { value: 0 }
        gsap.to(state, {
          value: target,
          duration: 0.6 + Math.min(1.2, target / 800),
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(state.value).toLocaleString()
          },
        })
      }
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
      <div className="mx-auto w-full max-w-290 p-4 md:px-10 md:py-8">
        <PageHeader
          breadcrumb="Dashboard"
          title={`Hello, ${greeting}`}
          description={
            data.oversight
              ? data.oversight.scope === 'workspace'
                ? "Here's what's happening across the workspace."
                : "Here's what needs you in the groups you manage."
              : "Here's where your conversations stand."
          }
          actions={
            data.role === 'admin' ? (
              <>
                <button onClick={() => setInviting(true)} className="btn btn-secondary">
                  + Invite people
                </button>
                <button onClick={() => setCreatingGroup(true)} className="btn btn-primary">
                  + Create group
                </button>
              </>
            ) : undefined
          }
        />

        {inviting && <InviteDialog onClose={() => setInviting(false)} />}
        {creatingGroup && (
          <CreateGroupDialog
            onClose={() => setCreatingGroup(false)}
            onCreated={() => router.push('/app/chat')}
          />
        )}

        {/* ── KPI row — members/clients have 3 cards, oversight adds a 4th */}
        <div
          className={`mb-5 grid grid-cols-2 gap-4 ${
            data.oversight ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
          }`}
        >
          {data.oversight && (
            <StatCard
              label={
                data.oversight.scope === 'workspace'
                  ? 'Awaiting review'
                  : 'Awaiting your review'
              }
              value={data.oversight.pendingCount}
              tone={data.oversight.pendingCount > 0 ? 'teal' : 'plain'}
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
                tone="teal"
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
                tone={data.myPendingCount > 0 ? 'teal' : 'plain'}
                hint={
                  data.myPendingCount > 0
                    ? 'Waiting on an admin'
                    : 'Nothing held'
                }
              />
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          {/* ── Groups ─────────────────────────────────────────────── */}
          <section
            data-av
            className="rounded-xl border border-border bg-surface p-4 shadow-e1"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Your groups</h2>
              <Link
                href="/app/chat"
                className="flex items-center gap-1 text-sm font-medium text-teal-t hover:underline"
              >
                Open chat <ArrowRightIcon />
              </Link>
            </div>
            {data.groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No groups yet — your admin adds you when a project starts.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {data.groups.slice(0, 8).map((group) => (
                  <li key={group.id}>
                    <Link
                      href={`/app/chat?g=${group.id}`}
                      className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-rowhover"
                    >
                      <GroupMark name={group.name} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {group.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {group.isManager ? 'You manage this group' : 'Member'}
                        </span>
                      </span>
                      {group.unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal px-1.5 font-mono text-[11px] font-semibold tabular-nums text-[#1a1a1a]">
                          {group.unread}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Right column ───────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {data.oversight?.scope === 'workspace' && (
              <section
                data-av
                className={`rounded-xl border p-4 shadow-e1 ${
                  data.oversight.chain && !data.oversight.chain.ok
                    ? 'border-danger bg-danger/10'
                    : 'border-border bg-surface'
                }`}
              >
                <h2 className="mb-2 font-semibold">Evidence chain</h2>
                {data.oversight.chain === null ? (
                  <p className="text-sm text-muted">
                    Not verified yet — runs nightly, or check it now.
                  </p>
                ) : data.oversight.chain.ok ? (
                  <p className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sel text-teal-t">
                      <LockIcon />
                    </span>
                    <span className="text-ink-2">
                      Verified intact ·{' '}
                      <span className="font-mono text-xs tabular-nums">
                        {timeFormat.format(new Date(data.oversight.chain.checkedAt))}
                      </span>
                    </span>
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-danger">
                    Chain broken — open the audit log now.
                  </p>
                )}
                <Link
                  href="/app/audit"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-t hover:underline"
                >
                  Open audit log <ArrowRightIcon />
                </Link>
              </section>
            )}

            {data.oversight?.scope === 'workspace' && (
              <section
                data-av
                className="min-h-0 flex-1 rounded-xl border border-border bg-surface p-4 shadow-e1"
              >
                <h2 className="mb-2 font-semibold">Recent activity</h2>
                {data.oversight.recent.length === 0 ? (
                  <p className="text-sm text-muted">Nothing recorded yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.oversight.recent.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2 text-sm">
                        <PersonMark name={entry.actor} size={20} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{entry.actor}</span>{' '}
                          <span className="rounded bg-sel px-1 font-mono text-xs text-teal-t">
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
                data-av
                className="rounded-xl border border-border bg-surface p-4 shadow-e1"
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
  tone?: 'teal' | 'plain'
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {props.label}
      </p>
      <p
        data-count={props.value}
        className={`mt-1 font-mono text-[30px] font-semibold leading-9 tabular-nums ${
          props.tone === 'teal' ? 'text-teal-t' : ''
        }`}
      >
        {props.value.toLocaleString()}
      </p>
      {props.hint && <p className="mt-0.5 text-xs text-muted">{props.hint}</p>}
    </>
  )
  const className = `rounded-xl border border-border bg-surface p-4 shadow-e1 ${
    props.href ? 'transition-colors hover:bg-rowhover' : ''
  }`

  return props.href ? (
    <Link data-av href={props.href} className={className}>
      {body}
    </Link>
  ) : (
    <div data-av className={className}>
      {body}
    </div>
  )
}
