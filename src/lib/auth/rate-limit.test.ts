import { describe, expect, it } from 'vitest'

import { createRateLimiter } from './rate-limit'

describe('rate limiter (M3-04)', () => {
  it('allows up to max within the window, then blocks', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 })
    expect(limiter.check('k', 0)).toBe(true)
    expect(limiter.check('k', 100)).toBe(true)
    expect(limiter.check('k', 200)).toBe(true)
    expect(limiter.check('k', 300)).toBe(false)
  })

  it('slides: old hits expire out of the window', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 })
    expect(limiter.check('k', 0)).toBe(true)
    expect(limiter.check('k', 500)).toBe(true)
    expect(limiter.check('k', 900)).toBe(false)
    // t=1100: the hit at t=0 has aged out
    expect(limiter.check('k', 1100)).toBe(true)
  })

  it('keys are independent', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 })
    expect(limiter.check('a', 0)).toBe(true)
    expect(limiter.check('b', 0)).toBe(true)
    expect(limiter.check('a', 1)).toBe(false)
  })

  it('a blocked attempt does not extend the window (no lockout spiral)', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 })
    expect(limiter.check('k', 0)).toBe(true)
    expect(limiter.check('k', 500)).toBe(false)
    expect(limiter.check('k', 1001)).toBe(true)
  })
})
