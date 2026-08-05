import { detect } from './index'
import type { DetectionAction, DetectionConfig, FindingType } from './types'

/**
 * Corpus scoring (M2-10) — the spec's §11 success metric made executable:
 *
 *   ≥95% recall on `hold` cases, ≤5% false-hold rate on everything else.
 *
 * Shared by the CI gate (corpus.test.ts) and the report script
 * (scripts/score-detection.ts). Pure, like everything in this module.
 */

export type CorpusCase = {
  text: string
  expect: DetectionAction
  /** Finding types that should be present (informational, not gated). */
  types?: FindingType[]
}

export type CaseResult = CorpusCase & {
  actual: DetectionAction
  ruleIds: string[]
}

export type ScoreReport = {
  total: number
  /** expect=hold */
  holdCases: number
  holdCaught: number
  holdRecall: number
  /** expect=allow|flag_only that were incorrectly held */
  negatives: number
  falseHolds: number
  falseHoldRate: number
  /** expect=flag_only that produced no finding at all (informational) */
  flagMisses: number
  misses: CaseResult[]
  falseHoldCases: CaseResult[]
}

export const HOLD_RECALL_FLOOR = 0.95
export const FALSE_HOLD_CEILING = 0.05

export function scoreCorpus(
  cases: CorpusCase[],
  config?: Partial<DetectionConfig>,
): ScoreReport {
  const results: CaseResult[] = cases.map((corpusCase) => {
    const verdict = detect(corpusCase.text, config)
    return {
      ...corpusCase,
      actual: verdict.action,
      ruleIds: verdict.findings.map((f) => f.rule_id),
    }
  })

  const holdResults = results.filter((r) => r.expect === 'hold')
  const negativeResults = results.filter((r) => r.expect !== 'hold')

  const misses = holdResults.filter((r) => r.actual !== 'hold')
  const falseHoldCases = negativeResults.filter((r) => r.actual === 'hold')
  const flagMisses = results.filter(
    (r) => r.expect === 'flag_only' && r.actual === 'allow',
  ).length

  return {
    total: results.length,
    holdCases: holdResults.length,
    holdCaught: holdResults.length - misses.length,
    holdRecall:
      holdResults.length === 0
        ? 1
        : (holdResults.length - misses.length) / holdResults.length,
    negatives: negativeResults.length,
    falseHolds: falseHoldCases.length,
    falseHoldRate:
      negativeResults.length === 0
        ? 0
        : falseHoldCases.length / negativeResults.length,
    flagMisses,
    misses,
    falseHoldCases,
  }
}

export function formatReport(report: ScoreReport): string {
  const lines: string[] = [
    `corpus: ${report.total} cases`,
    `hold recall:     ${report.holdCaught}/${report.holdCases} = ${(report.holdRecall * 100).toFixed(1)}%  (floor ${HOLD_RECALL_FLOOR * 100}%)`,
    `false-hold rate: ${report.falseHolds}/${report.negatives} = ${(report.falseHoldRate * 100).toFixed(1)}%  (ceiling ${FALSE_HOLD_CEILING * 100}%)`,
    `flag misses (informational): ${report.flagMisses}`,
  ]

  if (report.misses.length > 0) {
    lines.push('', 'MISSED HOLDS:')
    for (const miss of report.misses) {
      lines.push(`  [${miss.actual}] ${JSON.stringify(miss.text)}`)
    }
  }

  if (report.falseHoldCases.length > 0) {
    lines.push('', 'FALSE HOLDS:')
    for (const falseHold of report.falseHoldCases) {
      lines.push(
        `  [expected ${falseHold.expect}] ${JSON.stringify(falseHold.text)} — rules: ${falseHold.ruleIds.join(', ')}`,
      )
    }
  }

  return lines.join('\n')
}
