import type { Severity } from '@melorx/core'

/** A single OpenFDA drug label record, reduced to the fields we extract from. */
export interface LabelRecord {
  /** openfda.set_id — the stable label identifier across revisions. */
  set_id: string
  /** openfda.effective_time — label revision date (YYYYMMDD per OpenFDA). */
  effective_time: string | null
  /** openfda.rxcui — the RxCUIs associated with the label's subject drug(s). */
  subjectRxcuis: string[]
  /** A display name for the subject drug, for logging and sources[]. */
  subjectName: string
  /** The drug_interactions[] array joined into a single block per record. */
  interactionsText: string
  /** Source URL for this label (DailyMed or FDA label page). */
  url: string
}

export type ResolutionQuality = 'exact' | 'approximate' | 'unresolved'

export interface ResolvedDrug {
  rxcui: string
  name: string
  quality: ResolutionQuality
}

/** Callback that resolves a surface form to an RxCUI. Injected so extract.ts is pure. */
export type ResolverFn = (surfaceForm: string) => ResolvedDrug | null

export interface CandidatePair {
  subjectRxcui: string
  objectRxcui: string
  severity: Severity
  mechanism: string
  management: string | null
  sentence: string
  patternId: string
  confidence: number
  setId: string
  effectiveTime: string | null
  url: string
  labelName: string
  /** True when both subject and object RxCUIs were exact-matched by the resolver. */
  bothExact: boolean
}
