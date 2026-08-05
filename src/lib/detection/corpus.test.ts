import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  FALSE_HOLD_CEILING,
  HOLD_RECALL_FLOOR,
  formatReport,
  scoreCorpus,
  type CorpusCase,
} from './score'

/**
 * The corpus gate (M2-10) — the spec's §11 detection metric enforced on every
 * commit: ≥95% recall on hold cases, ≤5% false-hold rate on the rest.
 *
 * A failure prints the full report naming each missed/false case and the rule
 * responsible, so a regression identifies its own culprit.
 */
function loadCorpus(): CorpusCase[] {
  const raw = readFileSync(
    join(process.cwd(), 'src/lib/detection/__fixtures__/corpus.jsonl'),
    'utf8',
  )
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line) as CorpusCase
      } catch {
        throw new Error(`corpus.jsonl line ${i + 1} is not valid JSON`)
      }
    })
}

describe('detection corpus gate', () => {
  const cases = loadCorpus()
  const report = scoreCorpus(cases)

  it('has a substantial corpus (≥150 cases)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(150)
  })

  it(`holds ≥${HOLD_RECALL_FLOOR * 100}% of contact-sharing cases`, () => {
    expect(report.holdRecall, `\n${formatReport(report)}`).toBeGreaterThanOrEqual(
      HOLD_RECALL_FLOOR,
    )
  })

  it(`false-holds ≤${FALSE_HOLD_CEILING * 100}% of legitimate messages`, () => {
    expect(report.falseHoldRate, `\n${formatReport(report)}`).toBeLessThanOrEqual(
      FALSE_HOLD_CEILING,
    )
  })
})
