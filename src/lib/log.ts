import 'server-only'

/**
 * Structured logging (M10-04) — with the product's one hard rule baked in:
 * NO message bodies, emails, phone numbers, or tokens in any log line. A
 * confidentiality product cannot spill its contents into a log aggregator.
 *
 * The API is deliberately narrow: you log EVENT + IDS, never payloads. The
 * redactor is a tripwire for mistakes, not an invitation to pass secrets.
 * reportError() is the seam a real error monitor (Sentry etc.) plugs into.
 */

type LogFields = Record<string, string | number | boolean | null | undefined>

const FORBIDDEN_KEYS = /body|email|phone|token|password|secret|findings/i
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g
const LONG_DIGITS_RE = /\+?\d[\d\s().-]{7,}\d/g

/** Strip anything that looks like contact data from a string. */
export function redact(value: string): string {
  return value.replace(EMAIL_RE, '[email]').replace(LONG_DIGITS_RE, '[number]')
}

function clean(fields: LogFields): LogFields {
  const out: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.test(key)) continue // dropped, not redacted — by name
    out[key] = typeof value === 'string' ? redact(value) : value
  }
  return out
}

export function logEvent(event: string, fields: LogFields = {}): void {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), level: 'info', event, ...clean(fields) }),
  )
}

export function logError(event: string, error: unknown, fields: LogFields = {}): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: 'error',
      event,
      error: redact(message),
      ...clean(fields),
    }),
  )
  reportError(event, error)
}

/** Error-monitor seam: swap the body for Sentry.captureException etc. */
function reportError(event: string, error: unknown): void {
  // no-op in the pilot — the structured console line is the record.
  void event
  void error
}
