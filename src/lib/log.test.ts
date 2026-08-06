import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { logError, logEvent, redact } from './log'

/**
 * M10-04 acceptance: no log line contains a message body, email, or phone
 * number — enforced by key-dropping and content redaction, tested here.
 */
describe('log hygiene', () => {
  afterEach(() => vi.restoreAllMocks())

  it('redacts emails and phone-shaped numbers from strings', () => {
    expect(redact('reach me at nadia.khan94@gmail.com')).toBe('reach me at [email]')
    expect(redact('call +92 300 1234567 now')).toBe('call [number] now')
    expect(redact('error at line 42')).toBe('error at line 42') // short numbers survive
  })

  it('drops forbidden keys outright — body, email, token never log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logEvent('message.sent', {
      message_id: 'abc',
      body: 'my number is +92 300 1234567',
      sender_email: 'x@y.com',
      token: 'raw-invite-token',
      group_id: 'g1',
    })
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain('message.sent')
    expect(line).toContain('abc')
    expect(line).toContain('g1')
    expect(line).not.toContain('1234567')
    expect(line).not.toContain('x@y.com')
    expect(line).not.toContain('raw-invite-token')
  })

  it('redacts contact data that sneaks into error MESSAGES', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('send.failed', new Error('duplicate key nadia.khan94@gmail.com'), {
      route: '/api/messages',
    })
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain('send.failed')
    expect(line).not.toContain('gmail.com')
    expect(line).toContain('[email]')
  })
})
