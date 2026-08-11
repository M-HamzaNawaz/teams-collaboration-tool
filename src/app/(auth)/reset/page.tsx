'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { browserClient } from '@/lib/supabase/browser-client'

import {
  AuthShell,
  inputClass,
  primaryButtonClass,
  primaryButtonStyle,
  SuccessToast,
} from '../auth-ui'

/**
 * Password reset (M3-04). Two modes on one page:
 *  - request: enter email → POST /api/auth/reset (always "check your email")
 *  - update:  arrived via the emailed link — the browser client exchanges the
 *    recovery code automatically; the form sets the new password.
 */
export default function ResetPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'request' | 'update'>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = browserClient()
    // The recovery link lands here with a code; a session in recovery mode
    // means we're updating, not requesting.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setMode('update')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function requestReset(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setMessage('If that account exists, a reset link is on its way.')
    setBusy(false)
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { error } = await browserClient().auth.updateUser({ password })
    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <AuthShell
      title={mode === 'request' ? 'Reset password' : 'Set a new password'}
      subtitle={
        mode === 'request'
          ? "We'll email you a secure reset link"
          : 'Choose a new password to finish'
      }
    >
      {mode === 'request' ? (
        <form onSubmit={requestReset} className="flex flex-col gap-4">
          <input type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          {message && <p className="text-sm text-muted">{message}</p>}
          <button type="submit" disabled={busy} className={primaryButtonClass} style={primaryButtonStyle}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-center text-sm text-muted">
            <a href="/login" className="underline hover:text-foreground">Back to sign in</a>
          </p>
          {message && (
            <SuccessToast message="Reset link on its way — check your inbox" />
          )}
        </form>
      ) : (
        <form onSubmit={updatePassword} className="flex flex-col gap-4">
          <input type="password" required minLength={10} placeholder="New password (min 10 chars)"
            value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          {message && <p className="text-sm text-danger">{message}</p>}
          <button type="submit" disabled={busy} className={primaryButtonClass} style={primaryButtonStyle}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
