export const SEVERITY_VALUES = [
  'contraindicated',
  'serious',
  'moderate',
  'minor',
  'monitor',
] as const
export type Severity = (typeof SEVERITY_VALUES)[number]

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

export interface DrugIdentifiers {
  ndc: string[]
  atc: string | null
  drugbank: string | null
  brand_names: string[]
}

export interface DrugConcept {
  id: string
  rxcui: string
  name: string
  drug_class: string[]
  identifiers: DrugIdentifiers
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

export interface MelorxClientOptions {
  /** Base URL of a melorx API (e.g. `https://demo.melorx.com` or `http://localhost:3000`). */
  baseUrl: string
  /** Optional API key. Attached as `x-api-key` header when present. */
  apiKey?: string
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Default request timeout in ms. Defaults to 10_000. */
  timeoutMs?: number
  /** Number of retries for 5xx responses. Defaults to 3. */
  maxRetries?: number
  /** Base delay between retries in ms. Exponential backoff is applied. Defaults to 200. */
  retryBaseDelayMs?: number
  /** Additional headers merged into every request. */
  headers?: Record<string, string>
}

export interface RequestOverrides {
  signal?: AbortSignal
  headers?: Record<string, string>
}

export interface ResponseMeta {
  version: string
  dataset_version?: string
  query_time_ms?: number
}

export interface BatchMeta extends ResponseMeta {
  pairs_requested: number
  pairs_resolved: number
  pairs_failed: number
}

export interface InteractionResponse {
  data: InteractionResult
  disclaimer: string
  meta: ResponseMeta
}

export interface BatchError {
  index: number
  error: 'DRUG_NOT_FOUND'
  drug: string
}

export interface BatchInteractionResponse {
  data: InteractionResult[]
  errors: BatchError[]
  disclaimer: string
  meta: BatchMeta
}

export interface DrugResponse {
  data: DrugConcept
  meta: { version: string }
}

export interface InteractionPair {
  drug1: string
  drug2: string
}
