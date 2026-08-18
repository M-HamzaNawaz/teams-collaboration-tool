'use client'

import { useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { useEscape } from '@/lib/ui/dismiss'

/**
 * Create a group and choose the rules it lives by.
 *
 * Every switch here changes real behaviour in a write path — none are
 * decorative. What is deliberately NOT offered: any way to skip detection
 * or the audit trail. A group may choose whether a finding HOLDS a message
 * or merely flags it; contact info is always detected and always recorded.
 */

type Rules = {
  hold_contact_info: boolean
  scan_filenames: boolean
  allow_files: boolean
  escalate_minutes: number
  auto_approve_hours: number
}

const DEFAULTS: Rules = {
  hold_contact_info: true,
  scan_filenames: true,
  allow_files: true,
  escalate_minutes: 30,
  auto_approve_hours: 8,
}

export function CreateGroupDialog(props: {
  onClose: () => void
  onCreated?: (group: GroupRow) => void
}) {
  const [name, setName] = useState('')
  const [rules, setRules] = useState<Rules>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscape(props.onClose)

  function toggle(key: 'hold_contact_info' | 'scan_filenames' | 'allow_files') {
    setRules((current) => ({ ...current, [key]: !current[key] }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || name.trim().length < 2) return
    setBusy(true)
    setError(null)

    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), settings: rules }),
    })
    const data = (await response.json().catch(() => null)) as
      | { group?: GroupRow; error?: string }
      | null

    if (response.status === 201 && data?.group) {
      props.onCreated?.(data.group)
      props.onClose()
    } else {
      setError(data?.error ?? 'could not create the group')
      setBusy(false)
    }
  }

  return (
    <div
      className="overlay-in fixed inset-0 z-400 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        className="card-in max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-e2"
      >
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="create-group-title" className="text-lg font-semibold">New group</h2>
            <p className="text-sm text-muted">
              A group is the only place conversations happen — there are no
              private chats.
            </p>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 hover:bg-surface-2"
          >
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Group name
            <input
              required
              autoFocus
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp — Website redesign"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-teal-d"
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
              Rules for this group
            </legend>

            <RuleCheckbox
              checked={rules.hold_contact_info}
              onChange={() => toggle('hold_contact_info')}
              title="Hold messages containing contact details"
              on="Emails, phone numbers and messaging links wait for approval before anyone sees them."
              off="They deliver immediately but are still flagged for you — nothing escapes the record."
            />
            <RuleCheckbox
              checked={rules.allow_files}
              onChange={() => toggle('allow_files')}
              title="Allow file sharing"
              on="Members can attach files; downloads use expiring private links."
              off="Uploads are rejected in this group."
            />
            <RuleCheckbox
              checked={rules.scan_filenames}
              onChange={() => toggle('scan_filenames')}
              disabled={!rules.allow_files}
              title="Screen file names"
              on="A file called call-me-0300123.pdf is held like any other contact attempt."
              off="File names are not screened. (File contents are never scanned in v1.)"
            />
          </fieldset>

          <fieldset className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Escalate after
              <select
                value={rules.escalate_minutes}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    escalate_minutes: Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Auto-release after
              <select
                value={rules.auto_approve_hours}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    auto_approve_hours: Number(e.target.value),
                  }))
                }
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value={4}>4 hours</option>
                <option value={8}>8 hours</option>
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
              </select>
            </label>
          </fieldset>
          <p className="-mt-2 text-xs text-muted">
            A held message nudges the group manager after the first timer, then
            releases itself — still flagged — after the second, so work never
            freezes waiting on someone.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="btn btn-primary py-2.5"
          >
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </form>
      </div>
    </div>
  )
}

function RuleCheckbox(props: {
  checked: boolean
  onChange: () => void
  title: string
  on: string
  off: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-[10px] p-2.5 ${
        props.disabled ? 'opacity-50' : 'hover:bg-rowhover'
      }`}
    >
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{props.title}</span>
        <span className="block text-xs text-muted">
          {props.checked ? props.on : props.off}
        </span>
      </span>
    </label>
  )
}
