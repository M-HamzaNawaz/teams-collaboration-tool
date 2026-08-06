import 'server-only'

import { serverEnv } from '@/lib/env/server'

/**
 * Email delivery (M4-04) — Resend behind a two-line interface.
 *
 * No SDK: Resend's send endpoint is one POST, and a fetch keeps the
 * dependency count where the project likes it. When RESEND_API_KEY is unset
 * (local dev, CI), the message is logged to the server console instead so
 * the invite flow is fully testable without an email account. `delivered`
 * tells the caller which of the two happened.
 */

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

export type EmailResult = {
  /** true = handed to Resend; false = dev fallback (logged, not sent). */
  delivered: boolean
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!serverEnv.RESEND_API_KEY) {
    if (serverEnv.NODE_ENV === 'production') {
      // Booting prod without email is a config error, not a silent fallback.
      throw new Error('RESEND_API_KEY is not set in production')
    }
    console.log(
      `[email:dev-fallback] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    )
    return { delivered: false }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: serverEnv.EMAIL_FROM ?? 'Confide <noreply@example.com>',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`email send failed (${response.status}): ${body}`)
  }

  return { delivered: true }
}
