/**
 * Sliding-window rate limiter (M3-04). In-memory, per server instance —
 * adequate for the pilot's single deployment; swap the store for Redis when
 * there are multiple instances (the interface stays).
 *
 * Injectable clock so tests don't sleep.
 */

export type RateLimiter = {
  /** true = allowed; false = over the limit. */
  check(key: string, now?: number): boolean
  reset(): void
}

export function createRateLimiter(options: {
  windowMs: number
  max: number
}): RateLimiter {
  const { windowMs, max } = options
  const hits = new Map<string, number[]>()

  return {
    check(key, now = Date.now()) {
      const cutoff = now - windowMs
      const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff)

      if (timestamps.length >= max) {
        hits.set(key, timestamps)
        return false
      }

      timestamps.push(now)
      hits.set(key, timestamps)
      return true
    },
    reset() {
      hits.clear()
    },
  }
}

/** Login + signup attempts: 10 per 15 minutes per EMAIL (brute-force guard). */
export const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 })

/**
 * Per-IP companion limit, deliberately roomier: an agency office behind one
 * NAT is many people on one IP, and 10/15min locked a whole team out after
 * a morning of logins (found by the E2E suite tripping it).
 */
export const authIpLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 60 })

/** Password-reset requests: 3 per hour per key. */
export const resetLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 })

/** Standard 429 response for a failed check. */
export function rateLimitResponse(): Response {
  return Response.json(
    { error: 'too many attempts, try again later' },
    { status: 429 },
  )
}

/** Best-effort client IP for rate-limit keys (behind a proxy in production). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? 'unknown'
}
