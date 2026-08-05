/**
 * Text normalizer with offset mapping (M2-02).
 *
 * Rules run against a canonical form of the text: lowercased, NFKC-folded,
 * common homoglyphs mapped to ASCII, zero-width characters stripped, and
 * whitespace runs collapsed. This is what defeats the one-character bypasses —
 * a Cyrillic 'о' in "jоhn@gmail.com", a zero-width space inside a phone
 * number, a fullwidth '＠'.
 *
 * Every output character records where it came from, so spans found in the
 * normalized text map back to the ORIGINAL string — the admin review UI
 * (M6-01) highlights exactly what the sender typed, not a transformed echo.
 */

export type NormalizedText = {
  text: string
  /** For each output char: UTF-16 index of its source char in the original. */
  sourceIndex: number[]
  /** For each output char: UTF-16 length of that source char. */
  sourceLength: number[]
}

/**
 * Homoglyphs seen in real obfuscation: Cyrillic and Greek letters that render
 * identically (or near-identically) to Latin. Applied AFTER lowercasing, so
 * uppercase Cyrillic 'А' folds via toLowerCase() first.
 *
 * Deliberately conservative — only visually-identical mappings. Aggressive
 * confusable folding (e.g. 'l' ↔ '1') would corrupt legitimate text and
 * inflate false positives.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic → Latin
  а: 'a', в: 'b', с: 'c', е: 'e', ё: 'e', з: '3', и: 'u', к: 'k', м: 'm',
  н: 'h', о: 'o', р: 'p', т: 't', у: 'y', х: 'x', ѕ: 's', і: 'i', ј: 'j',
  ԛ: 'q', ѡ: 'w', ԝ: 'w',
  // Greek → Latin
  α: 'a', β: 'b', γ: 'y', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p',
  τ: 't', υ: 'u', χ: 'x', ω: 'w', σ: 'o',
}

/** Invisible characters used to split matches: ZWSP, ZWNJ, ZWJ, BOM, soft hyphen, word joiner. */
const ZERO_WIDTH = new Set([
  '​', '‌', '‍', '﻿', '­', '⁠', '᠎',
])

export function normalize(input: string): NormalizedText {
  const out: string[] = []
  const sourceIndex: number[] = []
  const sourceLength: number[] = []
  let lastWasSpace = false

  let index = 0
  for (const char of input) {
    const start = index
    const length = char.length // UTF-16 units (2 for astral chars)
    index += length

    if (ZERO_WIDTH.has(char)) continue

    // NFKC folds fullwidth forms (＠ → @, １ → 1) and compatibility chars.
    let folded = ''
    for (const c of char.normalize('NFKC').toLowerCase()) {
      folded += CONFUSABLES[c] ?? c
    }

    if (/^\s+$/.test(folded)) {
      if (lastWasSpace) continue
      out.push(' ')
      sourceIndex.push(start)
      sourceLength.push(length)
      lastWasSpace = true
      continue
    }

    lastWasSpace = false
    for (const c of folded) {
      out.push(c)
      sourceIndex.push(start)
      sourceLength.push(length)
    }
  }

  return { text: out.join(''), sourceIndex, sourceLength }
}

/**
 * Map a [start, end) span in normalized text back to a [start, end) span in
 * the original string.
 */
export function toOriginalSpan(
  normalized: NormalizedText,
  start: number,
  end: number,
): [number, number] {
  if (normalized.text.length === 0 || end <= start) return [0, 0]

  const clampedStart = Math.min(start, normalized.text.length - 1)
  const clampedLast = Math.min(end - 1, normalized.text.length - 1)

  return [
    normalized.sourceIndex[clampedStart],
    normalized.sourceIndex[clampedLast] + normalized.sourceLength[clampedLast],
  ]
}
