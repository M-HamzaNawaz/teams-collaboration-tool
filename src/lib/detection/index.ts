import { resolveDetectionConfig } from './config'
import { emailDomain, emailLocalPart } from './rules/email'
import { allRules } from './rules'
import { normalize, toOriginalSpan } from './normalize'
import type {
  DetectionAction,
  DetectionConfig,
  Finding,
  Verdict,
} from './types'

export { defaultDetectionConfig, resolveDetectionConfig } from './config'
export { normalize, toOriginalSpan } from './normalize'
export type {
  DetectionAction,
  DetectionConfig,
  Finding,
  FindingType,
  Verdict,
} from './types'

const SEVERITY: Record<DetectionAction, number> = {
  allow: 0,
  flag_only: 1,
  hold: 2,
}

/**
 * The detection engine (M2-08). Pure and synchronous: text in, verdict out.
 *
 * Pipeline: normalize → run rules → map spans to the original text → dedupe
 * overlaps → allowlist demotion → threshold mapping → verdict.
 *
 * Called server-side BEFORE any message row exists (M5-01) — the product's
 * core guarantee is that no delivered message skipped this function. Also
 * scans filenames (M7-02) and name-change requests (M4-07).
 *
 * Phase 2's LLM pass will be `detectAsync()` beside this, same Verdict shape,
 * with these deterministic rules as the fast path and the fallback.
 */
export function detect(
  text: string,
  config?: Partial<DetectionConfig>,
): Verdict {
  const resolved = resolveDetectionConfig(config)

  if (!text || text.length === 0) return { action: 'allow', findings: [] }

  const normalized = normalize(text)
  const findings: Finding[] = []

  for (const rule of allRules) {
    const target = rule.target === 'raw' ? text : normalized.text

    for (const match of rule.find(target, resolved)) {
      const span: [number, number] =
        rule.target === 'raw'
          ? [match.start, match.end]
          : toOriginalSpan(normalized, match.start, match.end)

      findings.push({
        type: rule.type,
        rule_id: rule.id,
        match: text.slice(span[0], span[1]),
        span,
        confidence: match.confidence,
        action: 'hold', // provisional; mapped below
      })
    }
  }

  const deduped = dedupeOverlaps(findings)

  for (const finding of deduped) {
    finding.action = mapAction(finding, resolved)
  }

  const action = deduped.reduce<DetectionAction>(
    (worst, f) => (SEVERITY[f.action] > SEVERITY[worst] ? f.action : worst),
    'allow',
  )

  return { action, findings: deduped }
}

/**
 * Overlapping matches of the SAME type collapse to the highest-confidence one
 * (the international and contiguous phone rules often both hit). Different
 * types deliberately co-exist — wa.me/+92300… is both a link and a phone.
 */
function dedupeOverlaps(findings: Finding[]): Finding[] {
  const sorted = [...findings].sort(
    (a, b) => a.span[0] - b.span[0] || b.confidence - a.confidence,
  )
  const kept: Finding[] = []

  for (const candidate of sorted) {
    const clash = kept.find(
      (existing) =>
        existing.type === candidate.type &&
        existing.span[0] < candidate.span[1] &&
        candidate.span[0] < existing.span[1],
    )
    if (!clash) {
      kept.push(candidate)
      continue
    }
    if (candidate.confidence > clash.confidence) {
      kept[kept.indexOf(clash)] = candidate
    }
  }

  return kept
}

/**
 * Allowlist demotion + threshold mapping (M2-07/08).
 *
 * Demotions cap a finding at flag_only — the message DELIVERS but the admin
 * still sees it. Findings are never dropped entirely: the audit trail records
 * everything, which is the difference between an allowlist and a blind spot.
 */
function mapAction(finding: Finding, config: DetectionConfig): DetectionAction {
  if (finding.type === 'email') {
    const domain = emailDomain(finding.match.toLowerCase())
    const localPart = emailLocalPart(finding.match.toLowerCase())

    if (domain) {
      const domainAllowed = [
        ...config.workspaceDomains,
        ...config.allowedDomains,
      ].some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
      if (domainAllowed) return 'flag_only'
    }

    if (localPart && config.flagOnlyLocalParts.includes(localPart)) {
      return 'flag_only'
    }
  }

  return finding.confidence >= config.holdThreshold ? 'hold' : 'flag_only'
}
