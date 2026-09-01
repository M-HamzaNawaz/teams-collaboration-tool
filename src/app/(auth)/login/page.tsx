'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import {
  AuthShell,
  inputClass,
  primaryButtonClass,
  primaryButtonStyle,
} from '../auth-ui'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (response.ok) {
      // Same-origin paths only: an attacker-supplied ?next= must not be able
      // to bounce a fresh login onto their own domain (open redirect).
      const next = searchParams.get('next')
      const safe =
        next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
          ? next
          : '/app'
      router.push(safe as Parameters<typeof router.push>[0])
      router.refresh()
      return
    }

    const body = (await response.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? 'login failed')
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        required
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className={primaryButtonClass}
        style={primaryButtonStyle}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center text-sm text-muted">
        <a href="/reset" className="underline hover:text-foreground">Forgot password?</a>
        {' · '}
        <a href="/signup" className="underline hover:text-foreground">Create a workspace</a>
        {' · '}
        <a href="/download" className="underline hover:text-foreground">Get the apps</a>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in to Confide"
      subtitle="Agency collaboration with client protection built in"
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
