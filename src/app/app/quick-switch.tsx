'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { GroupMark } from '@/lib/ui/avatar'
import { useEscape } from '@/lib/ui/dismiss'
import { SearchIcon } from '@/lib/ui/icons'

/**
 * ⌘K quick switch — the top bar's search is REAL: it filters the caller's
 * pages and groups and jumps straight there (groups deep-link into chat via
 * ?g=). No dead chrome: if it looks like search, it searches.
 */

type Target = { kind: 'page' | 'group'; label: string; href: string }

export function QuickSwitch(props: {
  pages: Array<{ label: string; href: string }>
  groups: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const targets = useMemo<Target[]>(() => {
    const q = query.trim().toLowerCase()
    const pages: Target[] = props.pages.map((p) => ({
      kind: 'page',
      label: p.label,
      href: p.href,
    }))
    const groups: Target[] = props.groups.map((g) => ({
      kind: 'group',
      label: g.name,
      href: `/app/chat?g=${g.id}`,
    }))
    const all = [...pages, ...groups]
    if (!q) return all.slice(0, 12)
    return all.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 12)
  }, [query, props.pages, props.groups])

  useEscape(props.onClose)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function go(target: Target | undefined) {
    if (!target) return
    props.onClose()
    router.push(target.href)
    router.refresh()
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-[400] flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={props.onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Quick search"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Contain Tab: the palette is modal, focus stays inside it.
          if (e.key !== 'Tab') return
          const focusables = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
            'input, button',
          )
          if (focusables.length === 0) return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }}
        className="frosted w-full max-w-lg overflow-hidden rounded-xl border border-border shadow-e2"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <span className="text-muted">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0) // typing re-anchors the highlight to the top hit
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') props.onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, targets.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              }
              if (e.key === 'Enter') go(targets[index])
            }}
            placeholder="Jump to a page or group…"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted"
          />
          <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">
            esc
          </span>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {targets.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted">
              Nothing matches “{query}”.
            </li>
          )}
          {targets.map((target, i) => (
            <li key={target.href}>
              <button
                onClick={() => go(target)}
                onMouseEnter={() => setIndex(i)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                  i === index ? 'bg-sel text-teal-t' : ''
                }`}
              >
                {target.kind === 'group' ? (
                  <GroupMark name={target.label} size={24} />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <SearchIcon />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {target.label}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  {target.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
