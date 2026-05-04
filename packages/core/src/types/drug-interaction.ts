import type { Severity } from './severity.js'

export const SOURCE_TYPES = [
  'clinical_guideline',
  'fda_label',
  'peer_reviewed_study',
  'clinical_pharmacist_review',
] as const

export type SourceType = (typeof SOURCE_TYPES)[number]

export interface InteractionSource {
  name: string
  url: string
  type: SourceType
  accessed_date: string
}

export interface InteractionResult {
  drug1: { rxcui: string; name: string; classes: string[] }
  drug2: { rxcui: string; name: string; classes: string[] }
  interactions: Array<{
    severity: Severity
    mechanism: string | null
    management: string | null
    sources: InteractionSource[]
    confidence: number | null
  }>
}
