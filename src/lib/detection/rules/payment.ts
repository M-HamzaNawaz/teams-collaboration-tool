import type { Rule, RuleMatch } from '../types'

/**
 * Payment handle and crypto rules (M2-05).
 *
 * Payment links/IBANs run on normalized text. Crypto addresses run on RAW
 * text — base58 and EIP-55 shapes are case-sensitive, and lowercasing
 * destroys exactly the signal that distinguishes an address from noise.
 */

const PAYPAL_ME = /paypal\.me\/[a-z0-9._-]{2,}/g
const WISE = /wise\.com\/(?:pay|invite|share)\/[a-z0-9-]+/g
const PAYONEER = /payoneer\.com\/[a-z0-9/_-]*(?:pay|checkout)[a-z0-9/_-]*/g

/** IBAN candidate: CC + 2 check digits + 11–30 alphanumerics, spaces allowed. */
const IBAN_CANDIDATE = /\b[a-z]{2}\s?\d{2}(?:\s?[a-z0-9]){11,30}\b/g

const BTC_LEGACY = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g
const BTC_BECH32 = /\bbc1[a-z0-9]{20,60}\b/gi
const ETH = /\b0x[a-fA-F0-9]{40}\b/g
const TRON = /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g

/**
 * ISO 13616 mod-97 check. This is what keeps random 20-char strings out:
 * a candidate that fails the checksum is not reported at all.
 */
export function isValidIban(candidate: string): boolean {
  const compact = candidate.replace(/\s/g, '').toUpperCase()
  if (compact.length < 15 || compact.length > 34) return false
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false

  const rearranged = compact.slice(4) + compact.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const value = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }
  return remainder === 1
}

function collect(regex: RegExp, text: string, confidence: number): RuleMatch[] {
  const matches: RuleMatch[] = []
  for (const m of text.matchAll(regex)) {
    matches.push({ start: m.index, end: m.index + m[0].length, confidence })
  }
  return matches
}

export const paymentRules: Rule[] = [
  {
    id: 'payment.paypal-me',
    type: 'payment_handle',
    target: 'normalized',
    find: (text) => collect(PAYPAL_ME, text, 0.95),
  },
  {
    id: 'payment.wise-link',
    type: 'payment_handle',
    target: 'normalized',
    find: (text) => collect(WISE, text, 0.9),
  },
  {
    id: 'payment.payoneer-link',
    type: 'payment_handle',
    target: 'normalized',
    find: (text) => collect(PAYONEER, text, 0.9),
  },
  {
    id: 'payment.iban',
    type: 'payment_handle',
    target: 'normalized',
    find(text) {
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(IBAN_CANDIDATE)) {
        if (!isValidIban(m[0])) continue
        matches.push({ start: m.index, end: m.index + m[0].length, confidence: 0.98 })
      }
      return matches
    },
  },
  {
    id: 'crypto.btc-legacy',
    type: 'crypto_address',
    target: 'raw',
    find(text) {
      const matches: RuleMatch[] = []
      for (const m of text.matchAll(BTC_LEGACY)) {
        // Base58 addresses mix cases; an all-lower or all-upper run of this
        // shape is far more likely an ID/hash fragment than an address.
        if (!/[a-z]/.test(m[0]) || !/[A-Z]/.test(m[0])) continue
        matches.push({ start: m.index, end: m.index + m[0].length, confidence: 0.8 })
      }
      return matches
    },
  },
  {
    id: 'crypto.btc-bech32',
    type: 'crypto_address',
    target: 'raw',
    find: (text) => collect(BTC_BECH32, text, 0.9),
  },
  {
    id: 'crypto.eth',
    type: 'crypto_address',
    target: 'raw',
    find: (text) => collect(ETH, text, 0.95),
  },
  {
    id: 'crypto.tron',
    type: 'crypto_address',
    target: 'raw',
    find: (text) => collect(TRON, text, 0.85),
  },
]
