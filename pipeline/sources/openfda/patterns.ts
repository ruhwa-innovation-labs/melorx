/**
 * FDA label interaction-sentence patterns.
 *
 * Each pattern captures a single **object-drug token** from a sentence that
 * describes an interaction with the label's subject drug. Patterns are authored
 * precision-first: a narrow match beats a broad one. See ADR-004.
 *
 * Object-drug tokens are constrained to a single word (optional hyphens). This
 * means multi-word brand names (e.g. "calcium carbonate") are out of scope for
 * v0.3 long-tail extraction — a deliberate trade-off for precision. Class
 * references ("NSAIDs", "ACE inhibitors") are detected by a separate pass in
 * extract.ts, not by these patterns.
 *
 * Adding a pattern:
 *   1. Add a golden-file excerpt in __tests__/fixtures/labels.json that
 *      demonstrates the sentence grammar the pattern should catch.
 *   2. Add the pattern here with a stable `id`, the `regex`, the `objectGroup`
 *      index, a `specificity` weight, and an optional `severityHint`.
 *   3. Run `pnpm test` — if extract.test.ts passes on the fixture, the pattern
 *      is valid.
 */

import type { Severity } from '@melorx/core'

export interface Pattern {
  /** Stable identifier, e.g. "CONCOMITANT_USE_V1". Used as the row key in the review table. */
  id: string
  regex: RegExp
  /** 1-indexed capture group containing the object-drug surface form. */
  objectGroup: number
  /** 0.0..1.0 — intrinsic reliability of this pattern. Higher = narrower. */
  specificity: number
  /** Optional: overrides keyword-based severity inference when set. */
  severityHint?: Severity
}

/** Single-token drug surface form: a word with optional hyphens. */
const DRUG_TOKEN = '([A-Za-z][A-Za-z-]{2,})'

export const PATTERNS: readonly Pattern[] = [
  {
    id: 'SHOULD_NOT_BE_USED_V1',
    regex: new RegExp(
      `should not be (?:used|co-?administered|taken) (?:concomitantly |together )?with ${DRUG_TOKEN}`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.75,
    severityHint: 'contraindicated',
  },
  {
    id: 'CONTRAINDICATED_WITH_V1',
    regex: new RegExp(
      `(?:is |are )?contraindicated (?:in patients (?:who are |currently )?(?:receiving|taking) |with (?:concomitant )?(?:use of )?)${DRUG_TOKEN}`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.8,
    severityHint: 'contraindicated',
  },
  {
    id: 'AVOID_CONCURRENT_USE_V1',
    regex: new RegExp(
      `avoid (?:concurrent use |concomitant (?:use|administration) |(?:co-?administration )?)(?:with |of )${DRUG_TOKEN}`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.65,
    severityHint: 'serious',
  },
  {
    id: 'CONCOMITANT_USE_V1',
    regex: new RegExp(
      `concomitant (?:use|administration) (?:with|of) ${DRUG_TOKEN} (?:has been|may|can|is|has|should|increases|decreases)`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.6,
  },
  {
    id: 'CO_ADMIN_WITH_V1',
    regex: new RegExp(
      `co-?administration (?:of|with) ${DRUG_TOKEN} (?:increases?|decreases?|may (?:increase|decrease|result)|can (?:increase|decrease))`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.55,
  },
  {
    id: 'COMBINATION_WITH_SUBJECT_V1',
    regex: new RegExp(
      `combination of [A-Za-z][A-Za-z-]+ with ${DRUG_TOKEN} (?:may|can|has been|should|increases|decreases|results)`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.55,
  },
  {
    id: 'MONITOR_WHEN_COADMIN_V1',
    regex: new RegExp(
      `monitor (?:patients|closely|carefully)?\\s*(?:for |when (?:co-?administering |administering )?)(?:with )?${DRUG_TOKEN}`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.45,
    severityHint: 'monitor',
  },
  {
    id: 'INCREASED_LEVELS_V1',
    regex: new RegExp(
      `(?:may |can )?(?:increase|elevate|result in increased) (?:plasma |serum )?(?:levels|concentrations|exposure) of ${DRUG_TOKEN}`,
      'i',
    ),
    objectGroup: 1,
    specificity: 0.55,
  },
]

/**
 * Class-reference keywords. When a sentence mentions any of these and ALSO
 * matches an interaction pattern, the pair is logged as a class reference
 * rather than emitted as a concrete pair. Per ADR-004.
 */
/**
 * Class-reference keywords. Only MUST-BE-PLURAL or compound-noun class
 * references are listed — single-noun forms (e.g. "anticoagulant",
 * "statin therapy") can appear as adjectives describing an effect rather than
 * as drug-class references, producing false positives.
 */
export const CLASS_REFERENCE_KEYWORDS: readonly RegExp[] = [
  /\bNSAIDs\b/i,
  /\bACE inhibitors?\b/i,
  /\bARBs\b/i,
  /\bMAO inhibitors\b/i,
  /\bMAOIs\b/i,
  /\bSSRIs\b/i,
  /\bbeta[- ]blockers\b/i,
  /\bcalcium channel blockers\b/i,
  /\bCYP3A4 (?:inhibitors|inducers)\b/i,
]

export function sentenceMentionsDrugClass(sentence: string): string | null {
  for (const re of CLASS_REFERENCE_KEYWORDS) {
    const match = sentence.match(re)
    if (match) return match[0]
  }
  return null
}
