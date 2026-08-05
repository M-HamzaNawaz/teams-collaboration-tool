'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Workspace signup (M3-03) — the agency ADMIN's entry point. Members and
 * clients never see this page: they join through email invitations (M4),
 * where the admin has already fixed their display name and role.
 */
export default function SignupPage() {
  const router = useRouter()
  const [workspaceName, setWorkspaceName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, workspaceName, displayName }),
    })

    if (response.ok) {
      router.push('/app')
      router.refresh()
      return
    }

    const body = (await response.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? 'signup failed')
    setBusy(false)
  }

  const inputClass =
    'rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold">Create your workspace</h1>
        <p className="text-sm text-neutral-500">
          You&apos;ll be the workspace admin. Team members and clients join by
          invitation only.
        </p>
        <input required placeholder="Agency / workspace name" value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)} className={inputClass} />
        <input required placeholder="Your display name" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        <input type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input type="password" required minLength={10} placeholder="Password (min 10 chars)"
          value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
        <p className="text-sm text-neutral-500">
          Already have an account? <a href="/login" className="underline">Sign in</a>
        </p>
      </form>
    </main>
  )
}
