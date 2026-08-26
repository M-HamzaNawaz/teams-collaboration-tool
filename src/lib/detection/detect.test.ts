import { describe, expect, it } from 'vitest'

import { detect } from './index'

/**
 * Targeted acceptance tests (M2-08) — the named cases from the spec and
 * TECHNICAL_PLAN, asserted individually. The corpus gate measures aggregate
 * quality; these pin the behaviors we quoted to the team lead.
 */
describe('detect() — spec acceptance cases', () => {
  it('holds "reach me at john@gmail.com"', () => {
    const verdict = detect('reach me at john@gmail.com')
    expect(verdict.action).toBe('hold')
    expect(verdict.findings[0]?.type).toBe('email')
  })

  it('holds "my number is +92 300 1234567"', () => {
    const verdict = detect('my number is +92 300 1234567')
    expect(verdict.action).toBe('hold')
    expect(verdict.findings[0]?.type).toBe('phone')
  })

  it('holds spaced digits "0300 1234567"', () => {
    expect(detect('0300 1234567').action).toBe('hold')
  })

  it('flags but DELIVERS a pasted service email (three-tier, not two)', () => {
    const verdict = detect('see the error from noreply@stripe.com')
    expect(verdict.action).toBe('flag_only')
    expect(verdict.findings).toHaveLength(1)
  })

  it('allows a plain work message untouched', () => {
    const verdict = detect('PR is up at github.com/acme/api')
    expect(verdict.action).toBe('allow')
    expect(verdict.findings).toHaveLength(0)
  })

  it('holds a wa.me link', () => {
    expect(detect('wa.me/923001234567').action).toBe('hold')
  })

  it('holds a flagged filename (M7-02 path)', () => {
    expect(detect('call-me-+923001234567.pdf').action).toBe('hold')
  })
})

describe('detect() — obfuscation and evasion', () => {
  it('catches "[at] ... [dot]" obfuscation', () => {
    expect(detect('john [at] gmail [dot] com').action).toBe('hold')
  })

  it('catches bare "at ... dot" obfuscation', () => {
    expect(detect('ahmed at gmail dot com').action).toBe('hold')
  })

  it('catches a Cyrillic homoglyph email and maps the span to the original text', () => {
    const original = 'jоhn@gmail.com' // Cyrillic о
    const verdict = detect(original)
    expect(verdict.action).toBe('hold')
    const [start, end] = verdict.findings[0].span
    expect(original.slice(start, end)).toBe(original)
  })

  it('catches a zero-width-space split email', () => {
    expect(detect('jo​hn@gmail.com').action).toBe('hold')
  })

  it('an obfuscated email at an allowlisted domain still holds (evasion is evasion)', () => {
    expect(detect('me [at] github [dot] com').action).toBe('hold')
  })
})

describe('detect() — false-positive guards', () => {
  it.each([
    'order #4471234 shipped',
    'v2.0.1 is tagged',
    'the demo is on 2026-08-04',
    'look at google.com for the pattern',
    'budget approved: PKR 10 500 000',
    'whitelist 192.168.1.100 on the vpn',
  ])('does not hold %j', (text) => {
    expect(detect(text).action).not.toBe('hold')
  })

  it('caps identifier digit runs at flag_only (zoom id, tracking number)', () => {
    expect(detect('zoom meeting id 883 7623 1157').action).toBe('flag_only')
    expect(detect('tracking number 9205 5000 1234').action).toBe('flag_only')
  })
})

describe('detect() — workspace config', () => {
  it('demotes the workspace own-domain emails to flag_only', () => {
    const verdict = detect('bill it to accounts@myagency.io', {
      workspaceDomains: ['myagency.io'],
    })
    expect(verdict.action).toBe('flag_only')
  })

  it('the same email HOLDS without the workspace domain configured', () => {
    expect(detect('bill it to accounts@myagency.io').action).toBe('hold')
  })

  it('empty input allows', () => {
    expect(detect('').action).toBe('allow')
  })

  it('recognises a real foreign number with no configuration at all', () => {
    // libphonenumber validates the digits as a PK mobile, so this holds
    // without anyone naming Pakistan anywhere. That is the whole point:
    // clients can be in any country and nobody has to predict which.
    expect(detect('werhdsf923001234567').action).toBe('hold')
    expect(detect('glued971501234567').action).toBe('hold') // UAE
    expect(detect('glued33612345678').action).toBe('hold') // France
  })

  it('does not mistake work identifiers for numbers from somewhere', () => {
    // The same check has to REJECT these, or it is just "is a number".
    expect(detect('epoch 1722787200').action).not.toBe('hold')
    expect(detect('we processed 2345678901 rows').action).not.toBe('hold')
    expect(detect('werhdsf123435432435').action).not.toBe('hold')
  })

  it('negative context still outranks a configured country code', () => {
    // The country-code check lives in the RULE, so finalize() has already
    // applied the NEGATIVE_CONTEXT cap by the time it matters.
    expect(
      detect('tracking 923001234567', { phoneCountryCodes: ['92'] }).action,
    ).toBe('flag_only')
  })
})

describe('detect() — strict mode (hold_numbers_min_digits)', () => {
  const strict = { holdAnyDigitRun: 7 }

  it('is inert unless a group turns it on', () => {
    expect(detect('order 4111222233 shipped').action).toBe('flag_only')
  })

  it('holds a long number no other rule would hold', () => {
    expect(detect('werhdsf123435432435', strict).action).toBe('hold')
  })

  it('counts digits through separators, so grouping does not evade it', () => {
    expect(detect('zoom meeting id 883 7623 1157', strict).action).toBe('hold')
  })

  it('holds ordinary references too — that IS the trade the group opted into', () => {
    expect(detect('order 4111222233 shipped', strict).action).toBe('hold')
    expect(detect('invoice 8837462910 is paid', strict).action).toBe('hold')
  })

  it('leaves short numbers and dates alone, or it would read as broken', () => {
    expect(detect('meet at 3pm tomorrow', strict).action).toBe('allow')
    expect(detect('standup in 10', strict).action).toBe('allow')
    expect(detect('v2.0.1 is tagged', strict).action).toBe('allow')
    expect(detect('the demo is on 2026-08-04', strict).action).toBe('allow')
  })

  it('min 1 really does mean ANY digit — a group may ask for that', () => {
    // The extreme setting, for a room whose rule is "no numbers here, take
    // it to a call". Measured at ~67% of ordinary chat held, which is the
    // point rather than a defect; it is per-group and off by default.
    const any = { holdAnyDigitRun: 1 }
    expect(detect('meet at 3pm tomorrow', any).action).toBe('hold')
    expect(detect('standup in 10', any).action).toBe('hold')
    expect(detect('v2.0.1 is tagged', any).action).toBe('hold')
  })

  it('even min 1 cannot hold a message with no digits in it', () => {
    expect(detect('morning team, all good here', { holdAnyDigitRun: 1 }).action).toBe(
      'allow',
    )
  })
})
