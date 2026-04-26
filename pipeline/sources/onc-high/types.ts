import { SOURCE_TYPES } from '@melorx/core'
import type { InteractionSource } from '@melorx/core'

export interface OncHighEntry {
  drug1: { rxcui: string; name: string }
  drug2: { rxcui: string; name: string }
  /** ONCHigh severity vocabulary — "significant" maps to canonical "moderate" */
  severity: 'contraindicated' | 'serious' | 'significant' | 'monitor'
  mechanism: string
  management: string
  source: {
    name: string
    url: string
    type: (typeof SOURCE_TYPES)[number]
    accessed_date: string
  }
}

export interface TransformedEntry {
  drug1: { rxcui: string; name: string }
  drug2: { rxcui: string; name: string }
  severity: 'contraindicated' | 'serious' | 'moderate' | 'minor' | 'monitor'
  mechanism: string
  management: string
  sources: InteractionSource[]
  isGenerated: false
  confidence: null
}
