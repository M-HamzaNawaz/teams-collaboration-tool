'use client'

import { useEffect, useRef, useState } from 'react'

import { useEscape } from '@/lib/ui/dismiss'
import { CheckIcon, ChevronDownIcon } from '@/lib/ui/icons'

/**
 * Themed replacement for a native <select> (JobPulse §4.4 menus): the
 * browser control ignores the design system entirely, so filters rendered
 * as OS widgets next to styled cards. This popover speaks the same dialect
 * as the top-bar menus — same radius, border, shadow, row hover.
 *
 * Listbox semantics: the trigger keeps focus and steers with the keyboard
 * (arrows/Home/End/Enter), aria-activedescendant points at the active row.
 */

export type SelectOption = { value: string; label: string }

export function SelectMenu(props: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  ariaLabel: string
  /** Extra classes for the wrapper (width usually). */
  className?: string
  /** Compact trigger for inline spots like the pager. */
  compact?: boolean
  /** Open upward when the trigger sits at the bottom of a scroll box. */
  direction?: 'down' | 'up'
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedIndex = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.value),
  )
  const selected = props.options[selectedIndex]

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEscape(() => setOpen(false))

  // Keep the active row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function openMenu() {
    setActive(selectedIndex)
    setOpen(true)
  }

  function choose(value: string) {
    props.onChange(value)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openMenu()
      }
      return
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((i) => Math.min(i + 1, props.options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(props.options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(props.options[active]?.value ?? props.value)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const menuId = `${props.id ?? props.ariaLabel.replace(/\s+/g, '-').toLowerCase()}-listbox`

  return (
    <div ref={rootRef} className={`relative ${props.className ?? ''}`}>
      <button
        type="button"
        role="combobox"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={props.ariaLabel}
        aria-controls={open ? menuId : undefined}
        aria-activedescendant={open ? `${menuId}-${active}` : undefined}
        className={`flex w-full items-center gap-2 rounded-lg border border-border bg-surface text-left outline-none transition-colors hover:bg-hover focus-visible:border-teal-d ${
          props.compact
            ? 'px-2 py-1 font-mono text-sm tabular-nums'
            : 'px-3 py-2 text-sm'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? '—'}</span>
        <span
          className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <ChevronDownIcon />
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="listbox"
          aria-label={props.ariaLabel}
          className={`card-in absolute left-0 z-50 max-h-72 min-w-full overflow-y-auto rounded-[10px] border border-border bg-surface p-1 shadow-e2 ${
            props.direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {props.options.map((option, index) => (
            <button
              key={option.value || '__all__'}
              type="button"
              role="option"
              id={`${menuId}-${index}`}
              aria-selected={option.value === props.value}
              data-index={index}
              onClick={() => choose(option.value)}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                index === active ? 'bg-rowhover' : ''
              } ${option.value === props.value ? 'font-medium' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === props.value && (
                <span className="shrink-0 text-teal-t">
                  <CheckIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
