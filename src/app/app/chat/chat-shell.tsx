'use client'

import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'

import type { RealtimeMessage } from '@/lib/realtime/messages'
import type { GroupRow } from '@/lib/types'
import { prefersReducedMotion } from '@/lib/ui/dismiss'
import { MessageSquareIcon } from '@/lib/ui/icons'

import { ChatPane } from './chat-pane'
import { GroupList } from './group-list'

/**
 * Chat shell (JobPulse §4.2): sidebar card + thread card on a 288px/1fr
 * grid, one screen at a time on mobile. Layout only knows WHICH group is
 * open — everything the pane shows is fetched under the caller's own RLS.
 */

export type Me = {
  userId: string
  displayName: string
  roleLabel: string
  isAdmin?: boolean
}

export function ChatShell(props: {
  groups: GroupRow[]
  /** Deep link (?g=) from the dashboard or the ⌘K quick switch. */
  initialGroupId?: string | null
  /** Server-fetched first page for the group that opens first — the pane
      paints real messages immediately instead of a second skeleton. */
  initialMessages?: RealtimeMessage[] | null
  workspaceName: string
  me: Me
  unreadByGroup?: Record<string, number>
}) {
  const [selected, setSelected] = useState<GroupRow | null>(
    () =>
      props.groups.find((g) => g.id === props.initialGroupId) ??
      props.groups[0] ??
      null,
  )
  // Mobile: 'list' or 'chat'. Desktop shows both, this state is ignored.
  // A deep-linked group opens straight into the conversation.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() =>
    props.initialGroupId ? 'chat' : 'list',
  )
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
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

  /**
   * Mobile back, done as history rather than as a gesture handler.
   *
   * On Android the left-edge swipe IS the system back gesture — there is
   * nothing to invent, only something to answer. Opening a conversation
   * pushes a history entry, so the swipe, the hardware/gesture back, the
   * browser back button and the in-app arrow all land in the same place:
   * the conversation list. Writing a custom swipe listener instead would
   * fight the OS for the same touch and still leave the real back button
   * broken.
   *
   * Same URL, only a state entry — the group already lives in ?g= for deep
   * links, and pushing that per tap would fill the address bar's history
   * with every room the user glanced at.
   *
   * Desktop pushes nothing: both panes are visible, so there is no "back"
   * to go to, and back should leave the page as it always has.
   */
  const MOBILE_ENTRY = 'confide:chat'

  function isMobileViewport() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches // below Tailwind md
    )
  }

  function openGroup(group: GroupRow) {
    setSelected(group)
    // Only from the list, so the ⌘K switcher opening a group while already
    // in a conversation does not stack a second entry.
    if (mobileView === 'list' && isMobileViewport()) {
      window.history.pushState({ [MOBILE_ENTRY]: true }, '')
    }
    setMobileView('chat')
  }

  useEffect(() => {
    function onPopState() {
      // Whatever the user pressed or swiped, they meant "out of this
      // conversation". Only meaningful on mobile; on desktop the list is
      // never hidden, so this is a no-op there.
      setMobileView('list')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function closeGroup() {
    // Through history, not straight to state: otherwise the arrow leaves the
    // pushed entry behind and the next back press appears to do nothing.
    if ((window.history.state as Record<string, unknown> | null)?.[MOBILE_ENTRY]) {
      window.history.back()
    } else {
      setMobileView('list')
    }
  }

  return (
    <div ref={shellRef} className="h-full w-full overflow-hidden">
      {/* Chat runs edge to edge — unlike the capped dashboard/audit pages,
          a conversation wants the whole width, not a centered column. */}
      <div className="flex h-full w-full gap-3 p-2 sm:p-3">
        {/* Sidebar card — hidden on mobile while a chat is open */}
        <aside
          data-anim="sidebar"
          className={`${
            mobileView === 'chat' ? 'hidden' : 'flex'
          } w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-e1 md:flex md:w-72`}
        >
          <GroupList
            groups={props.groups}
            workspaceName={props.workspaceName}
            me={props.me}
            selectedId={selected?.id ?? null}
            onSelect={openGroup}
            unreadByGroup={props.unreadByGroup ?? {}}
          />
        </aside>

        {/* Thread card — hidden on mobile while the list is open */}
        <main
          data-anim="pane"
          className={`${
            mobileView === 'list' ? 'hidden' : 'flex'
          } min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-e1 md:flex`}
        >
          {selected ? (
            <ChatPane
              key={selected.id}
              group={selected}
              me={props.me}
              initialMessages={
                // Only valid for the group the server fetched it for —
                // switching groups falls back to the pane's own loader.
                selected.id ===
                (props.groups.find((g) => g.id === props.initialGroupId) ??
                  props.groups[0])?.id
                  ? props.initialMessages
                  : undefined
              }
              onBack={closeGroup}
              onGroupChanged={() => setSelected(null)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-muted">
                  <MessageSquareIcon />
                </div>
                <p className="font-medium">No groups yet</p>
                <p className="mt-1 text-sm text-muted">
                  Your admin adds you to a group when a project starts.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
