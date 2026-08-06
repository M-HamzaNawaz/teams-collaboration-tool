'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  AuthShell,
  inputClass,
  primaryButtonClass,
  primaryButtonStyle,
} from '../auth-ui'

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

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="You'll be the admin — your team and clients join by invitation only"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input required placeholder="Agency / workspace name" value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)} className={inputClass} />
        <input required placeholder="Your display name" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        <input type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input type="password" required minLength={10} placeholder="Password (min 10 chars)"
          value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className={primaryButtonClass} style={primaryButtonStyle}>
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <a href="/login" className="underline hover:text-foreground">Sign in</a>
        </p>
      </form>
    </AuthShell>
  )
}
