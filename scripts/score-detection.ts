/**
 * Detection scorer report (M2-10): `npm run detection:score`
 *
 * Prints the corpus scorecard the CI gate enforces, plus per-rule hit counts —
 * the view you want open while tuning rules or triaging a regression.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { detect } from '../src/lib/detection'
import {
  formatReport,
  scoreCorpus,
  type CorpusCase,
} from '../src/lib/detection/score'

const raw = readFileSync(
  join(process.cwd(), 'src/lib/detection/__fixtures__/corpus.jsonl'),
  'utf8',
)
const cases: CorpusCase[] = raw
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as CorpusCase)

const report = scoreCorpus(cases)
console.log(formatReport(report))

// Per-rule hit counts across the corpus
const ruleHits = new Map<string, number>()
for (const corpusCase of cases) {
  for (const finding of detect(corpusCase.text).findings) {
    ruleHits.set(finding.rule_id, (ruleHits.get(finding.rule_id) ?? 0) + 1)
  }
}

console.log('\nrule hits:')
for (const [ruleId, count] of [...ruleHits.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${ruleId}`)
}

const gateFailed =
  report.holdRecall < 0.95 || report.falseHoldRate > 0.05
process.exit(gateFailed ? 1 : 0)
