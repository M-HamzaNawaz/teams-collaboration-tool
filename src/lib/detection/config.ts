import type { DetectionConfig } from './types'

/**
 * Default detection configuration (M2-07/08).
 *
 * Per-workspace overrides live in workspaces.settings_jsonb and are merged
 * over these at the call site (M5-01). The pilot starts strict and loosens
 * from real flag data — which is why this is config, not code.
 */
export const defaultDetectionConfig: DetectionConfig = {
  // Filled per workspace at creation (M3-03) with the agency's own domain(s).
  workspaceDomains: [],

  /**
   * Tooling domains whose emails appear constantly in legitimate work content —
   * pasted stack traces, CI output, invoice notifications. These demote from
   * hold to flag_only: the message delivers, the admin still sees it.
   *
   * NOT here on purpose: gmail.com, outlook.com, yahoo.com, proton.me — free
   * providers are where personal contact exchange actually happens.
   */
  allowedDomains: [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stripe.com',
    'figma.com',
    'vercel.com',
    'supabase.com',
    'netlify.com',
    'atlassian.net',
    'jira.com',
    'linear.app',
    'notion.so',
    'sentry.io',
    'npmjs.com',
    'amazonaws.com',
    'googleapis.com',
    'cloudflare.com',
  ],

  /**
   * Machine-sender local parts: an email FROM one of these is service noise,
   * not a person offering contact. Kept narrow — 'info@' and 'support@' are
   * deliberately absent, because "mail our support@" is a real bypass route.
   */
  flagOnlyLocalParts: [
    'noreply',
    'no-reply',
    'no_reply',
    'donotreply',
    'do-not-reply',
    'notifications',
    'notification',
    'mailer-daemon',
    'postmaster',
  ],

  /**
   * Findings at/above this confidence hold the message; below it they deliver
   * flagged. 0.7 puts high-certainty patterns (explicit emails, +country
   * phones, wa.me links) on hold and ambiguous digit runs on flag_only.
   */
  holdThreshold: 0.7,

  /**
   * Empty until a workspace names its own. Fill this at workspace creation
   * with the agency's country code(s) — "92" for Pakistan, "971" for the
   * UAE — and a glued international number stops being a bypass.
   */
  phoneCountryCodes: [],
}

/** Merge a workspace's stored partial config over the defaults. */
export function resolveDetectionConfig(
  overrides?: Partial<DetectionConfig>,
): DetectionConfig {
  if (!overrides) return defaultDetectionConfig
  return {
    workspaceDomains:
      overrides.workspaceDomains ?? defaultDetectionConfig.workspaceDomains,
    allowedDomains:
      overrides.allowedDomains ?? defaultDetectionConfig.allowedDomains,
    flagOnlyLocalParts:
      overrides.flagOnlyLocalParts ?? defaultDetectionConfig.flagOnlyLocalParts,
    holdThreshold:
      overrides.holdThreshold ?? defaultDetectionConfig.holdThreshold,
    phoneCountryCodes:
      overrides.phoneCountryCodes ?? defaultDetectionConfig.phoneCountryCodes,
  }
}
