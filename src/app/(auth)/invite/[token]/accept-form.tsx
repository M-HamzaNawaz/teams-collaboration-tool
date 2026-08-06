'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Consent + (for new accounts) password form (M4-05).
 *
 * One scrollable plain-language page, one checkbox, one continue — the
 * spec's consent screen (§8). Identity fields are rendered as static text:
 * the admin fixed them at invite time (I2) and nothing here can send them.
 */
export function AcceptForm(props: {
  token: string
  email: string
  displayName: string
  roleLabel: string | null
  workspaceName: string
  needsAccount: boolean
  consentText: string
}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (props.needsAccount && password !== confirm) {
      setError('passwords do not match')
      return
    }
    setBusy(true)

    const response = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: props.token,
        consent: true,
        ...(props.needsAccount ? { password } : {}),
      }),
    })

    if (response.status === 201) {
      router.push('/app')
      router.refresh()
      return
    }

    const body = (await response.json().catch(() => null)) as
      | { error?: string; requiresLogin?: boolean }
      | null

    if (response.status === 409 && body?.requiresLogin) {
      // Existing account, not signed in — sign in, then come back here.
      router.push(`/login?next=/invite/${encodeURIComponent(props.token)}`)
      return
    }

    setError(body?.error ?? 'something went wrong, please try again')
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        Join {props.workspaceName} on Confide
      </h1>

      <div className="rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <p>
          You&apos;ll join as{' '}
          <span className="font-medium">{props.displayName}</span>
          {props.roleLabel ? <> · {props.roleLabel}</> : null}
        </p>
        <p className="mt-1 text-neutral-500">{props.email}</p>
      </div>

      {props.needsAccount && (
        <>
          <input
            type="password"
            required
            minLength={10}
            placeholder="Choose a password (min 10 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            type="password"
            required
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </>
      )}

      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-neutral-200 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        {props.consentText}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I have read and agree to the communication and non-circumvention
          terms above.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy || !agreed}
        className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? 'Joining…' : `Agree and join ${props.workspaceName}`}
      </button>
    </form>
  )
}
