import { describe, expect, it } from 'vitest'

import { normalize, toOriginalSpan } from './normalize'

describe('normalize (M2-02)', () => {
  it('lowercases and folds fullwidth forms', () => {
    expect(normalize('JOHN＠GMAIL.COM').text).toBe('john@gmail.com')
  })

  it('maps Cyrillic homoglyphs to ASCII', () => {
    expect(normalize('jоhn').text).toBe('john') // Cyrillic о
  })

  it('strips zero-width characters', () => {
    expect(normalize('jo​hn‌@x﻿.co').text).toBe('john@x.co')
  })

  it('collapses whitespace runs', () => {
    expect(normalize('a   b\t\nc').text).toBe('a b c')
  })

  it('maps spans back to the original string exactly', () => {
    const original = 'Call jо​hn NOW' // Cyrillic о + ZWSP inside the name
    const n = normalize(original)
    const start = n.text.indexOf('john')
    const [origStart, origEnd] = toOriginalSpan(n, start, start + 4)
    expect(original.slice(origStart, origEnd)).toBe('jо​hn')
  })

  it('span mapping survives a collapsed whitespace run', () => {
    const original = 'a    +92 300 1234567'
    const n = normalize(original)
    const start = n.text.indexOf('+92')
    const [origStart, origEnd] = toOriginalSpan(n, start, n.text.length)
    expect(original.slice(origStart, origEnd)).toBe('+92 300 1234567')
  })

  it('handles empty input', () => {
    const n = normalize('')
    expect(n.text).toBe('')
    expect(toOriginalSpan(n, 0, 0)).toEqual([0, 0])
  })
})
