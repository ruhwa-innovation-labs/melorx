import type { Severity } from '@melorx/core'

/**
 * Keyword-based severity inference from a label sentence.
 *
 * Order matters: the first match wins. Higher-severity keywords are checked
 * first so a sentence containing both "contraindicated" and "monitor" maps
 * to `contraindicated`.
 */
const RULES: Array<{ severity: Severity; test: RegExp }> = [
  { severity: 'contraindicated', test: /\bcontraindicated\b/i },
  { severity: 'contraindicated', test: /\bshould not be (?:used|co-?administered|taken)\b/i },
  { severity: 'contraindicated', test: /\bdo not (?:administer|use)\b/i },
  { severity: 'serious', test: /\bavoid\b/i },
  { severity: 'serious', test: /\blife[- ]threatening\b/i },
  { severity: 'serious', test: /\bfatal\b/i },
  { severity: 'minor', test: /\bno clinically significant\b/i },
  { severity: 'monitor', test: /\bmonitor (?:closely|carefully|patients)?\b/i },
  { severity: 'monitor', test: /\bobservation\b/i },
  { severity: 'moderate', test: /\b(?:may|can) (?:increase|decrease|alter)\b/i },
  { severity: 'moderate', test: /\bincreases? (?:plasma |serum )?(?:levels|concentrations|exposure)\b/i },
  { severity: 'moderate', test: /\bdecreases? (?:plasma |serum )?(?:levels|concentrations|exposure)\b/i },
]

export function inferSeverity(sentence: string): Severity {
  for (const rule of RULES) {
    if (rule.test.test(sentence)) return rule.severity
  }
  return 'moderate'
}
