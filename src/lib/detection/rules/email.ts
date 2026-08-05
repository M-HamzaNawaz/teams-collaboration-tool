import type { Rule, RuleMatch } from '../types'

/**
 * Email rules (M2-03). All run on normalized text — lowercased, homoglyphs
 * folded, zero-width stripped — so "j​ohn@gmail.com" (zero-width split) and
 * "jоhn@gmail.com" (Cyrillic о) reduce to the plain form before matching.
 */

const STANDARD = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,24}\b/g

/**
 * Bracketed obfuscation: "name [at] gmail.com", "name(at)gmail dot com".
 * The at-marker is explicit, so a literal '.' OR a spelled "dot" both count
 * as domain separators.
 */
const BRACKETED_AT =
  /([a-z0-9][a-z0-9._+-]{0,63})\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\})\s*([a-z0-9][a-z0-9-]{0,62})((?:\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\.|\s+dot\s+)\s*[a-z0-9-]{1,63})+)/g

/**
 * Bare-word obfuscation: "john at gmail dot com". The at-marker is just the
 * word "at", which appears constantly in prose ("look at google.com"), so this
 * variant REQUIRES the domain separator to be a spelled/bracketed "dot" — a
 * literal '.' is not accepted. That single constraint keeps "PR is up at
 * github.com" out while catching "john at gmail dot com".
 */
const BARE_AT =
  /([a-z0-9][a-z0-9._+-]{0,63})\s+at\s+([a-z0-9][a-z0-9-]{0,62})((?:\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\s+dot\s+)\s*[a-z0-9-]{1,63})+)/g

/**
 * Words that precede " at " constantly in prose. A BARE_AT match whose
 * "username" is one of these is a sentence, not an address ("meet at nine
 * dot thirty"). Real usernames (john, ahmed.dev, sarah_k) pass through.
 */
const PROSE_USERNAMES = new Set([
  'me', 'is', 'are', 'was', 'be', 'we', 'it', 'up', 'him', 'her', 'them',
  'us', 'see', 'meet', 'meeting', 'look', 'back', 'here', 'there', 'starts',
  'begins', 'ends', 'am', 'pm', 'you', 'they', 'im', 'available',
])

/** The final domain label must be a plausible TLD ("meet at 5 dot 30" → '30' fails). */
function lastLabelIsTld(matchText: string): boolean {
  const labels = matchText
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}/g, ' dot ')
    .split(/\s+dot\s+|\./)
  const last = labels[labels.length - 1]?.trim()
  return /^[a-z]{2,24}$/.test(last ?? '')
}

function collectSimple(regex: RegExp, text: string, confidence: number): RuleMatch[] {
  const matches: RuleMatch[] = []
  for (const m of text.matchAll(regex)) {
    matches.push({ start: m.index, end: m.index + m[0].length, confidence })
  }
  return matches
}

/**
 * Obfuscation collector with guard-aware rescanning: when a match fails a
 * guard (prose username, non-TLD tail), scanning resumes just past the
 * username instead of past the whole match, so "me at john dot k at gmail
 * dot com" still finds the real address inside the rejected span.
 */
function collectObfuscated(
  regex: RegExp,
  text: string,
  confidence: number,
  rejectProseUsernames: boolean,
): RuleMatch[] {
  const matches: RuleMatch[] = []
  const scanner = new RegExp(regex.source, 'g')
  let match = scanner.exec(text)

  while (match !== null) {
    const username = match[1]
    const rejected =
      (rejectProseUsernames && PROSE_USERNAMES.has(username)) ||
      !lastLabelIsTld(match[0])

    if (rejected) {
      scanner.lastIndex = match.index + username.length + 1
    } else {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        confidence,
      })
    }
    match = scanner.exec(text)
  }

  return matches
}

export const emailRules: Rule[] = [
  {
    id: 'email.standard',
    type: 'email',
    target: 'normalized',
    find: (text) => collectSimple(STANDARD, text, 0.95),
  },
  {
    id: 'email.bracketed-at',
    type: 'email',
    target: 'normalized',
    find: (text) => collectObfuscated(BRACKETED_AT, text, 0.9, false),
  },
  {
    id: 'email.bare-at-spelled-dot',
    type: 'email',
    target: 'normalized',
    find: (text) => collectObfuscated(BARE_AT, text, 0.8, true),
  },
]

/**
 * Extract the domain of a matched email for allowlisting (M2-07). Handles the
 * standard form only — an OBFUSCATED email at an allowlisted domain stays at
 * full confidence on purpose: someone writing "me [at] ouragency dot com" is
 * evading the scanner, and evasion of an allowlisted domain is still evasion.
 */
export function emailDomain(matchText: string): string | undefined {
  const at = matchText.lastIndexOf('@')
  if (at === -1) return undefined
  return matchText.slice(at + 1).replace(/\.$/, '')
}

/** Extract the local part (before @) for the noreply-family demotion. */
export function emailLocalPart(matchText: string): string | undefined {
  const at = matchText.indexOf('@')
  if (at === -1) return undefined
  return matchText.slice(0, at)
}
