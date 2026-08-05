/**
 * Detection engine types (M2-01).
 *
 * The engine is a PURE module: text in, findings out. No database, no network,
 * no framework imports anywhere under src/lib/detection/. That purity is what
 * lets the corpus gate (M2-10) run thousands of fixtures per commit, and what
 * lets the same engine scan message bodies (M5-01), filenames (M7-02),
 * name-change requests (M4-07), and later call transcripts (Phase 3).
 */

export type FindingType =
  | 'email'
  | 'phone'
  | 'payment_handle'
  | 'social_link'
  | 'crypto_address'

/** What happens to the message. Severity order: hold > flag_only > allow. */
export type DetectionAction = 'allow' | 'flag_only' | 'hold'

export type Finding = {
  type: FindingType
  /** Which rule produced this, e.g. 'email.obfuscated-at-dot'. Names the culprit in corpus regressions. */
  rule_id: string
  /** The matched text AS THE SENDER TYPED IT (original string, not normalized). */
  match: string
  /** [start, end) offsets into the ORIGINAL text — the admin UI highlights exactly what was typed (M6-01). */
  span: [number, number]
  /** 0..1. Findings at or above the workspace hold threshold hold the message; below it they flag only. */
  confidence: number
  /** The action this single finding maps to after allowlisting and thresholds. */
  action: DetectionAction
}

export type Verdict = {
  /** Highest-severity action across findings. 'allow' means deliver untouched. */
  action: DetectionAction
  findings: Finding[]
}

/**
 * Per-workspace configuration (M2-07/08). Stored in workspaces.settings_jsonb;
 * the defaults in config.ts apply until an admin edits them.
 */
export type DetectionConfig = {
  /**
   * The agency's own domains. Emails at these domains demote to flag_only —
   * the agency's business address is not a bypass of the agency.
   */
  workspaceDomains: string[]
  /**
   * Service/tooling domains whose emails demote to flag_only (github.com,
   * stripe.com…). Pasted logs and CI output are the false-positive class that
   * would otherwise drive teams off the platform (TECHNICAL_PLAN §6.3).
   */
  allowedDomains: string[]
  /** Local parts that demote to flag_only regardless of domain (noreply…). */
  flagOnlyLocalParts: string[]
  /** Findings with confidence >= this hold the message; below it, flag_only. */
  holdThreshold: number
}

/** Internal: a raw match before allowlisting/threshold mapping. */
export type RuleMatch = {
  start: number
  end: number
  confidence: number
}

/** Internal: a detection rule. `target` picks which text the regex runs on. */
export type Rule = {
  id: string
  type: FindingType
  /**
   * 'normalized' — lowercased, confusables folded, zero-width stripped
   *                (defeats obfuscation; most rules run here).
   * 'raw'        — the original string (crypto addresses are case-sensitive,
   *                so base58/bech32 shapes only exist pre-normalization).
   */
  target: 'normalized' | 'raw'
  find(text: string): RuleMatch[]
}
