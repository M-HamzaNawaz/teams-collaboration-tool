import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

void React // classic-JSX runtime safety net; harmless under automatic

import { FormattedBody, stripFormatting } from './message-format'

const html = (body: string) => renderToStaticMarkup(<FormattedBody body={body} />)

describe('FormattedBody', () => {
  it('renders bold, underline, italic, strike, inline code', () => {
    const out = html('**bold** __under__ _it_ ~gone~ `x=1`')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<u>under</u>')
    expect(out).toContain('<em>it</em>')
    expect(out).toContain('<s>gone</s>')
    expect(out).toContain('>x=1</code>')
  })

  it('renders code blocks verbatim — no formatting inside', () => {
    const out = html('```\nconst a = **not bold**\n```')
    expect(out).toContain('const a = **not bold**')
    expect(out).not.toContain('<strong>')
  })

  it('renders quotes and both list kinds', () => {
    const out = html('> wisdom\n- one\n- two\n1. first\n2. second')
    expect(out).toContain('<blockquote')
    expect(out).toContain('<ul')
    expect(out).toContain('<ol')
    expect((out.match(/<li>/g) ?? []).length).toBe(4)
  })

  it('links http(s) URLs with safe rel', () => {
    const out = html('see https://github.com/acme/api now')
    expect(out).toContain('href="https://github.com/acme/api"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('NEVER interprets user HTML — script tags come out as text', () => {
    const out = html('<script>alert(1)</script> **hi**')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('<strong>hi</strong>')
  })

  it('unclosed markers render as literal text', () => {
    const out = html('a ** b _ c ~ d ` e')
    expect(out).not.toContain('<strong>')
    expect(out).not.toContain('<em>')
  })
})

describe('stripFormatting (the anti-reassembly helper)', () => {
  it('rejoins digits split by formatting marks', () => {
    expect(stripFormatting('0300**123**4567')).toBe('03001234567')
    expect(stripFormatting('ahmed_k_@gmail._com')).toBe('ahmedk@gmail.com')
    expect(stripFormatting('`0300` `1234567`')).toBe('0300 1234567')
  })

  it('drops quote/list prefixes but keeps the content', () => {
    expect(stripFormatting('> call me\n- 0300 1234567')).toBe('call me\n0300 1234567')
  })

  it('leaves clean text untouched', () => {
    expect(stripFormatting('deploy is green, standup at 10')).toBe(
      'deploy is green, standup at 10',
    )
  })
})
