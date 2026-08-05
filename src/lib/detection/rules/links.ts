import type { Rule, RuleMatch } from '../types'

/**
 * External contact link rules (M2-06).
 *
 * Only contact/social platforms are listed — github.com, figma.com and other
 * work-tool links are simply not matched, which is how they stay 'allow'
 * without needing an allowlist entry.
 */

const PATTERNS: Array<{ id: string; regex: RegExp; confidence: number }> = [
  {
    id: 'link.linkedin',
    regex: /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company|pub)\/[a-z0-9_%–-]+/g,
    confidence: 0.95,
  },
  {
    id: 'link.whatsapp',
    regex: /(?:https?:\/\/)?(?:wa\.me\/\+?\d{6,15}|(?:api\.|web\.)?whatsapp\.com\/send[^\s]*|chat\.whatsapp\.com\/[a-z0-9]+)/g,
    confidence: 0.98,
  },
  {
    id: 'link.telegram',
    regex: /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[a-z0-9_]{3,}/g,
    confidence: 0.95,
  },
  {
    id: 'link.instagram',
    regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-z0-9._]{2,}/g,
    confidence: 0.9,
  },
  {
    id: 'link.facebook',
    regex: /(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.com|fb\.me)\/[a-z0-9.]{3,}/g,
    confidence: 0.9,
  },
  {
    id: 'link.skype',
    regex: /(?:skype:[a-z0-9._-]{3,}|(?:https?:\/\/)?join\.skype\.com\/[a-z0-9]+)/g,
    confidence: 0.95,
  },
  {
    id: 'link.discord',
    regex: /(?:https?:\/\/)?(?:discord\.gg|discord\.com\/invite)\/[a-z0-9-]+/g,
    confidence: 0.9,
  },
  {
    id: 'link.signal',
    regex: /(?:https?:\/\/)?signal\.me\/#p\/\+?\d{6,15}/g,
    confidence: 0.95,
  },
  {
    id: 'link.snapchat',
    regex: /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/add\/[a-z0-9._-]{2,}/g,
    confidence: 0.9,
  },
  {
    // "insta: @handle", "telegram - @dev_ahmed" — the platform named next to
    // a handle. The @ alone is NOT matched ("@channel", "@here" mentions).
    id: 'link.platform-handle',
    regex: /\b(?:instagram|insta|ig|telegram|tg|snapchat|snap|tiktok|twitter|threads)\s*[:\-–]?\s*@[a-z0-9._]{2,}/g,
    confidence: 0.85,
  },
]

export const linkRules: Rule[] = PATTERNS.map(({ id, regex, confidence }) => ({
  id,
  type: 'social_link' as const,
  target: 'normalized' as const,
  find(text: string) {
    const matches: RuleMatch[] = []
    for (const m of text.matchAll(regex)) {
      matches.push({ start: m.index, end: m.index + m[0].length, confidence })
    }
    return matches
  },
}))
