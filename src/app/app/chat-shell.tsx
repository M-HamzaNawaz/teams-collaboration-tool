'use client'

import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'

import { ChatPane } from './chat-pane'
import { GroupList } from './group-list'

/**
 * Chat shell (M5-03): sidebar + message pane on desktop, one screen at a
 * time on mobile. Layout only knows WHICH group is open — everything the
 * pane shows is fetched under the caller's own RLS.
 */

export type Me = {
  userId: string
  displayName: string
  roleLabel: string
}

export function ChatShell(props: {
  groups: GroupRow[]
  workspaceName: string
  me: Me
}) {
  const [selected, setSelected] = useState<GroupRow | null>(
    props.groups[0] ?? null,
  )
  // Mobile: 'list' or 'chat'. Desktop shows both, this state is ignored.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Shell entrance: sidebar slides in, pane fades up — one timeline.
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-anim="sidebar"]', { x: -24, opacity: 0, duration: 0.45 })
        .from(
          '[data-anim="pane"]',
          { y: 16, opacity: 0, duration: 0.45 },
          '-=0.25',
        )
    }, shellRef)
    return () => ctx.revert()
  }, [])

  function openGroup(group: GroupRow) {
    setSelected(group)
    setMobileView('chat')
  }

  return (
    <div ref={shellRef} className="flex h-dvh w-full overflow-hidden">
      {/* Sidebar — hidden on mobile while a chat is open */}
      <aside
        data-anim="sidebar"
        className={`${
          mobileView === 'chat' ? 'hidden' : 'flex'
        } w-full shrink-0 flex-col border-r border-border bg-surface md:flex md:w-72 lg:w-80`}
      >
        <GroupList
          groups={props.groups}
          workspaceName={props.workspaceName}
          me={props.me}
          selectedId={selected?.id ?? null}
          onSelect={openGroup}
        />
      </aside>

      {/* Message pane — hidden on mobile while the list is open */}
      <main
        data-anim="pane"
        className={`${
          mobileView === 'list' ? 'hidden' : 'flex'
        } min-w-0 flex-1 flex-col md:flex`}
      >
        {selected ? (
          <ChatPane
            key={selected.id}
            group={selected}
            me={props.me}
            onBack={() => setMobileView('list')}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <div
                className="mx-auto mb-4 h-14 w-14 rounded-2xl"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
                }}
              />
              <p className="font-medium">No groups yet</p>
              <p className="mt-1 text-sm text-muted">
                Your admin adds you to a group when a project starts.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
