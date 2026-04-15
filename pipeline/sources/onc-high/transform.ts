import type { OncHighEntry, TransformedEntry } from './types.js'

const SEVERITY_MAP = {
  contraindicated: 'contraindicated',
  serious: 'serious',
  significant: 'moderate',
  monitor: 'monitor',
} as const satisfies Record<OncHighEntry['severity'], TransformedEntry['severity']>

export function transformEntry(entry: OncHighEntry): TransformedEntry {
  return {
    drug1: entry.drug1,
    drug2: entry.drug2,
    severity: SEVERITY_MAP[entry.severity],
    mechanism: entry.mechanism,
    management: entry.management,
    sources: [entry.source],
    isGenerated: false,
    confidence: null,
  }
}
