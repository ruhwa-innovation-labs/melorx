import type { LabelRecord } from './types.js'

/**
 * Shape of an individual record inside an OpenFDA drug-label partition JSON.
 *
 * This is a *structural subset* of the upstream schema — only the fields we
 * actually consume. See docs/api/openfda.md for the full field reference.
 */
export interface OpenFdaLabelJson {
  set_id?: string
  effective_time?: string
  openfda?: {
    rxcui?: string[]
    brand_name?: string[]
    generic_name?: string[]
    spl_set_id?: string[]
  }
  drug_interactions?: string[]
}

function pickSubjectName(record: OpenFdaLabelJson): string {
  const generic = record.openfda?.generic_name?.[0]
  if (generic) return generic.toLowerCase()
  const brand = record.openfda?.brand_name?.[0]
  if (brand) return brand.toLowerCase()
  return 'unknown'
}

function normaliseEffectiveTime(raw: string | undefined): string | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/**
 * Converts a single OpenFDA label JSON record into the internal LabelRecord
 * shape consumed by extract.ts. Returns `null` when the record is missing the
 * fields required for extraction (no rxcui, no interactions text).
 */
export function toLabelRecord(record: OpenFdaLabelJson): LabelRecord | null {
  const rxcuis = record.openfda?.rxcui ?? []
  if (rxcuis.length === 0) return null

  const interactions = record.drug_interactions ?? []
  if (interactions.length === 0) return null
  const interactionsText = interactions.join('\n\n').trim()
  if (!interactionsText) return null

  const setId = record.set_id ?? record.openfda?.spl_set_id?.[0]
  if (!setId) return null

  return {
    set_id: setId,
    effective_time: normaliseEffectiveTime(record.effective_time),
    subjectRxcuis: rxcuis,
    subjectName: pickSubjectName(record),
    interactionsText,
    url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`,
  }
}
