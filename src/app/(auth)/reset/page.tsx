'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { browserClient } from '@/lib/supabase/browser-client'

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

  const inputClass =
    'rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'
  const buttonClass =
    'rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900'

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {mode === 'request' ? (
        <form onSubmit={requestReset} className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="text-2xl font-semibold">Reset password</h1>
          <input type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          {message && <p className="text-sm text-neutral-500">{message}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      ) : (
        <form onSubmit={updatePassword} className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="text-2xl font-semibold">Set a new password</h1>
          <input type="password" required minLength={10} placeholder="New password (min 10 chars)"
            value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          {message && <p className="text-sm text-red-600">{message}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </main>
  )
}
