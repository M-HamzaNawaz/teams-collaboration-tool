import type { Rule, RuleMatch } from '../types'

/**
 * Phone rules (M2-04) — the highest false-positive risk in the engine: order
 * numbers, IDs, timestamps, IPs, versions, and money amounts all look like
 * digit runs. The design is layered confidence rather than one regex:
 *
 *   - explicit international prefix (+92 …)   → high confidence, holds
 *   - separated groups with phone shape       → medium; leading 0 / (area)
 *     or phone-words nearby push it over the hold threshold
 *   - bare 10–13 digit runs                   → low, flags only unless the
 *     surrounding words say it's a phone number ("call me on …")
 *
 * plus hard guards for the known impostors (dates, money, IDs, meeting pins).
 */

/** +CC or 00CC followed by 7–14 more digits with optional separators. */
const INTERNATIONAL =
  /(?:\+|00)\d{1,3}[\s.()-]{0,3}\d(?:[\s.()-]{0,3}\d){6,13}/g

/** Grouped digits: (0300) 123-4567, 0300 1234567, 021.3456.7890 … */
const SEPARATED =
  /(?<![\d.,-])(?:\(\d{2,4}\)|\d{2,4})(?:[\s.-]\d{2,8}){1,4}(?![\d,.-])/g

/** Bare digit run, phone-length. Hyphen in the guards keeps UUID/ID segments out. */
const CONTIGUOUS = /(?<![\d.,-])\d{10,13}(?![\d.,-])/g

/**
 * One digit at a time: "0 3 0 0 1 2 3 4 5 6 7".
 *
 * SEPARATED wants groups of 2-8, so single digits fall straight through it —
 * spacing every character is the obvious next move once someone learns that
 * "03001234567" is caught. Ten or more is well past anything a person writes
 * as a list, and the leading zero still decides hold vs flag.
 */
const SPACED_DIGITS = /(?<![\d\s.,-])\d(?:[ \t]\d){9,14}(?![\d.,-])/g

/** Spelled-out digits: "zero three zero zero one two three…" (≥7 digit-words). */
const SPELLED =
  /\b(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|oh)[\s,-]+){6,}(?:zero|one|two|three|four|five|six|seven|eight|nine|oh)\b/g

/**
 * Words shortly before a match that say "this is a phone number". The window
 * allows letters between keyword and digits ("call me on 0300…") but no other
 * digits, so the keyword binds to THIS number and not an earlier one.
 */
const CONTEXT =
  /(?:number|phone|mobile|cell|call|text|dial|ring|whatsapp|contact|reach)\b[^0-9]{0,20}$/

/**
 * Words that say the digits are an identifier, not a phone: tracking numbers,
 * Zoom meeting IDs, OTPs, invoice refs. Overrides CONTEXT (…"tracking number"
 * contains "number") and caps confidence below the hold threshold — the
 * message delivers flagged instead of freezing a courier update.
 */
const NEGATIVE_CONTEXT =
  /(?:tracking|order|invoice|account|ticket|case|reference|ref|serial|pin|code|otp|passcode|id|txn|transaction|iban|version|build|sha|hash|commit|digest|checksum|seed|nonce)\b[^0-9]{0,24}$/

/** Impostor guards, tested against the matched text itself. */
const ISO_DATE_START = /^(?:19|20)\d{2}\b/ // 2026-08-04, "2024 2025" year lists
const CURRENCY_NEAR = /(?:rs|pkr|usd|eur|gbp|aed|inr|[$€£₹])\s*\.?\s*$/

/**
 * Inside a run that is ALREADY mostly digits, letters that ape digits are
 * digits: "03oo1234567", "030012345l7". One-for-one substitution, so offsets
 * are unchanged and spans still point at what the sender actually typed.
 *
 * Scoped to digit-dominant runs deliberately. normalize.ts declines to fold
 * o/0 and l/1 globally because doing so "would corrupt legitimate text and
 * inflate false positives" — that judgement is right for prose. It does not
 * apply inside an eleven-character run that is already eight-tenths digits,
 * where a letter is not a letter.
 */
const LOOKALIKE_RUN = /[0-9oli]{10,16}/g

function foldDigitLookalikes(text: string): string {
  return text.replace(LOOKALIKE_RUN, (run) => {
    const digits = (run.match(/\d/g) ?? []).length
    // At most three impostors; beyond that it is a word, not a number.
    if (digits < run.length - 3) return run
    return run.replace(/o/g, '0').replace(/[li]/g, '1')
  })
}

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length
}

type Signals = { boost: number; capped: boolean }

function contextSignals(text: string, start: number): Signals {
  const window = text.slice(Math.max(0, start - 40), start)
  if (NEGATIVE_CONTEXT.test(window)) return { boost: 0, capped: true }
  return { boost: CONTEXT.test(window) ? 0.25 : 0, capped: false }
}

/**
 * Char immediately before the match — '#' or a letter means ID/version, not
 * phone (v1234567890, abc1234567890, #1234567890).
 *
 * Callers must NOT apply this when the surrounding words already say phone.
 * "call me at0300123456" is a number someone forgot to put a space in, and
 * letting a letter veto it makes one missing space a bypass of the whole
 * engine — which is the opposite of what this guard is for.
 */
function precededByIdMarker(text: string, start: number): boolean {
  if (start === 0) return false
  const before = text[start - 1]
  return before === '#' || /[a-z]/.test(before)
}

function finalize(base: number, signals: Signals): number {
  if (signals.capped) return Math.min(base, 0.5)
  return Math.min(0.98, base + signals.boost)
}

export const phoneRules: Rule[] = [
  {
    id: 'phone.international',
    type: 'phone',
    target: 'normalized',
    find(text) {
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(INTERNATIONAL)) {
        const digits = digitCount(m[0])
        if (digits < 8 || digits > 16) continue
        // A leading '+' is unambiguous — nothing but a phone number is
        // written that way, so no surrounding word talks it down. '00' is
        // not: "sha 000111000111000" is a digest, and this rule read it as
        // a Chinese mobile. Only the 00 form answers to NEGATIVE_CONTEXT.
        const explicitPlus = m[0].trimStart().startsWith('+')
        const signals = contextSignals(text, m.index)
        const confidence = !explicitPlus && signals.capped ? 0.5 : 0.95
        matches.push({ start: m.index, end: m.index + m[0].length, confidence })
      }
      return matches
    },
  },
  {
    id: 'phone.separated-groups',
    type: 'phone',
    target: 'normalized',
    find(text) {
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(SEPARATED)) {
        const s = m[0]
        const digits = digitCount(s)
        if (digits < 7 || digits > 14) continue
        if (ISO_DATE_START.test(s)) continue // dates, datetimes, year ranges
        if (CURRENCY_NEAR.test(text.slice(Math.max(0, m.index - 8), m.index))) continue // "PKR 10 500 000"

        // Leading 0 or a parenthesised area code is a strong phone signal;
        // other grouped digits stay below the hold threshold unless the
        // words around them say phone.
        const strongShape = /^[(0]/.test(s)
        const signals = contextSignals(text, m.index)
        // Phone words nearby outrank the ID-marker guard; without them it
        // stands.
        if (!signals.boost && precededByIdMarker(text, m.index)) continue
        const confidence = finalize(strongShape ? 0.75 : 0.62, signals)
        matches.push({ start: m.index, end: m.index + s.length, confidence })
      }
      return matches
    },
  },
  {
    id: 'phone.contiguous',
    type: 'phone',
    target: 'normalized',
    find(rawText) {
      // Same length, so every index below still lines up with rawText.
      const text = foldDigitLookalikes(rawText)
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(CONTIGUOUS)) {
        if (ISO_DATE_START.test(m[0]) && m[0].length <= 10) continue // 2026080400-ish stamps
        // Bare digit runs are timestamps, order IDs, tracking numbers — a
        // leading 0 (03001234567) or phone words nearby raise it to hold.
        const signals = contextSignals(text, m.index)
        // Phone words nearby outrank the ID-marker guard; without them it
        // stands. A NEGATIVE_CONTEXT hit leaves boost at 0, so "tracking
        // number abc1234567890" is still skipped.
        //
        // A LEADING ZERO outranks it too: identifiers and versions do not
        // start with 0, national numbers do, and that is what makes
        // "on03001234567" a phone number rather than a reference. Without
        // this, gluing the digits to any word is a bypass.
        const leadingZero = m[0].startsWith('0')
        if (!signals.boost && !leadingZero && precededByIdMarker(text, m.index)) {
          continue
        }
        const confidence = finalize(m[0].startsWith('0') ? 0.72 : 0.6, signals)
        matches.push({ start: m.index, end: m.index + m[0].length, confidence })
      }
      return matches
    },
  },
  {
    id: 'phone.spaced-digits',
    type: 'phone',
    target: 'normalized',
    find(text) {
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(SPACED_DIGITS)) {
        const signals = contextSignals(text, m.index)
        const confidence = finalize(m[0].startsWith('0') ? 0.75 : 0.62, signals)
        matches.push({ start: m.index, end: m.index + m[0].length, confidence })
      }
      return matches
    },
  },
  {
    id: 'phone.spelled-digits',
    type: 'phone',
    target: 'normalized',
    find(text) {
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(SPELLED)) {
        matches.push({ start: m.index, end: m.index + m[0].length, confidence: 0.85 })
      }
      return matches
    },
  },
]
