# M2 — Detection Engine

A pure TypeScript module: text in, findings out. No database, no network, no framework. That purity is what makes it testable against thousands of fixtures in CI and reusable for message bodies, filenames, name-change requests, and (Phase 3) call transcripts.

**Estimate:** 5 days · **Depends on:** M0 · **Blocks:** M5, M6

> **Runs fully in parallel with M1.** No shared code. If a second engineer joins, this is the clean split.

---

### M2-01 — Types and interface · `todo` · 2 h

```ts
type Finding = {
  type: 'email' | 'phone' | 'payment_handle' | 'social_link' | 'crypto_address'
  rule_id: string
  match: string
  span: [number, number]   // offsets into the ORIGINAL text
  confidence: number
}
type Verdict = { action: 'allow' | 'flag_only' | 'hold'; findings: Finding[] }

export function detect(text: string, config: DetectionConfig): Verdict
```

Synchronous and pure. Phase 2's LLM pass arrives as `detectAsync()` behind the same shape, with the deterministic rules as fast path and fallback.

**Acceptance:** compiles; no import touches Node or Next APIs.

---

### M2-02 — Normalizer with offset mapping · `todo` · 6 h

Lowercase, map Unicode confusables to ASCII (Cyrillic `а` → `a`, a one-character bypass otherwise), strip zero-width characters, collapse whitespace and separator runs.

Every transform records an index map so spans found in normalized text map back to the **original** string — the admin review UI highlights what the sender actually typed.

**Acceptance:** `"jоhn@gmail.com"` with a Cyrillic о is detected, and the reported span highlights the original characters exactly.

**Depends on:** M2-01

---

### M2-03 — Email rules · `todo` · 4 h

Standard addresses plus the obfuscations that matter: `[at]`, `(at)`, ` at `, `dot`, `name at gmail dot com`, spaced-out domains.

**Acceptance:** all email cases in the corpus pass; `noreply@` and allowlisted domains route to `flag_only`, not `hold` (M2-07/08).

**Depends on:** M2-02

---

### M2-04 — Phone rules · `todo` · 6 h

International formats, `+92 300 1234567`, dotted and dashed digits, parenthesised area codes, spaced digit runs, and spelled-out digits ("three zero zero…").

Highest false-positive risk in the whole engine — order numbers, IDs, version strings, and timestamps all look like phone numbers. Confidence scoring matters here more than anywhere else.

**Acceptance:** corpus phone cases pass; `#4471234`, `v2.0.1.14`, and `2026-08-04` do not hold.

**Depends on:** M2-02

---

### M2-05 — Payment handle and crypto rules · `todo` · 4 h

PayPal.me, IBAN (with checksum validation to cut false positives), Wise, Payoneer, BTC / ETH / TRON addresses.

**Acceptance:** corpus cases pass; a random 34-character string does not match IBAN.

**Depends on:** M2-02

---

### M2-06 — Contact link rules · `todo` · 3 h

LinkedIn, `wa.me`, `t.me`, Instagram, Facebook, Skype, Discord, Signal — bare, `www.`, and full-URL forms.

**Acceptance:** corpus cases pass; `github.com` and `figma.com` links are untouched.

**Depends on:** M2-02

---

### M2-07 — Allowlist layer · `todo` · 3 h

Per-workspace, admin-editable: the agency's own domain, plus defaults (`github.com`, `stripe.com`, `figma.com`, `vercel.com`, `noreply@*`).

This layer is what makes the false-positive rate survivable and the platform usable.

**Acceptance:** adding a domain to the allowlist demotes its findings from `hold` without disabling detection entirely.

**Depends on:** M2-03 … M2-06

---

### M2-08 — Three-tier action mapping · `todo` · 4 h

Findings → `allow` | `flag_only` | `hold`, per-workspace configurable.

The spec holds every match. That strangles adoption — a stack trace containing `noreply@stripe.com` freezing until Monday is how a team ends up back on WhatsApp. `flag_only` delivers immediately and still tells the admin. Anything resembling a person handing over their contact details still holds.

**Acceptance:** a pasted log containing a service email delivers and is flagged; `"whatsapp me at +92 300 1234567"` holds.

**Depends on:** M2-07

---

### M2-09 — Test corpus · `todo` · 8 h

`~200` cases in `src/lib/detection/__fixtures__/corpus.jsonl`:

```json
{"text": "reach me at john@gmail.com", "expect": "hold", "types": ["email"]}
{"text": "see the error from noreply@stripe.com", "expect": "flag_only", "types": ["email"]}
{"text": "PR is up at github.com/acme/api", "expect": "allow", "types": []}
```

Roughly half positives (including deliberate obfuscation attempts), half realistic negatives drawn from actual project chat — code, logs, invoices, dates, URLs.

**Written by someone other than the person who wrote the rules.** Otherwise we grade our own homework and the 95% target means nothing.

**Depends on:** M2-01

---

### M2-10 — Metrics harness and CI gate · `todo` · 4 h

Scores the corpus and fails the build below **≥95% recall on `hold` cases** or **>5% false-hold rate on negatives** — the spec's §11 success metric, enforced per commit instead of measured once at the end.

Output is a readable table so a regression names the rule that caused it.

**Acceptance:** deliberately weakening a rule fails CI with a diff of newly-missed cases.

**Depends on:** M2-08, M2-09
