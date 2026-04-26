// Public entry point for the @melorx/pipeline workspace.
// Re-exports the small surface that downstream workspaces (e.g. @melorx/cli)
// need to compose. Bin scripts and internal modules are NOT re-exported —
// they are implementation details of this package.

export {
  extractLabelsFromZip,
  normaliseChecksum,
  parseDownloadIndex,
  sha256Hex,
  verifyChecksum,
  type PartitionDescriptor,
} from './sources/openfda/download.js'

export {
  OPENFDA_DOWNLOAD_INDEX_URL,
  downloadAndVerifyPartition,
  fetchDownloadIndex,
  type DownloadedPartition,
  type FetchOptions,
} from './sources/openfda/fetch.js'

export {
  ingestOpenFdaPartition,
  type OpenFdaPartitionJson,
  type PartitionIngestCounters,
} from './sources/openfda/ingest-partition.js'

export {
  OPENFDA_SOURCE_NAME,
  loadPartitionStates,
  savePartitionState,
  type PartitionState,
} from './sources/openfda/pipeline-state.js'

export { persistCandidatesToReviewQueue } from './sources/openfda/persist.js'

export {
  countUngatedLowConfidenceRows,
  promoteReviewQueue,
  type PromoteCounters,
} from './sources/openfda/promote.js'

export {
  createResolverFn,
  lookupDrugConcept,
} from './sources/openfda/resolver-adapter.js'

export { extractFromLabel, type ExtractResult } from './sources/openfda/extract.js'
export { toLabelRecord, type OpenFdaLabelJson } from './sources/openfda/parse-label.js'
export { tokenizeSentences } from './sources/openfda/tokenize.js'
export { inferSeverity } from './sources/openfda/severity-map.js'
export { scoreCandidate, type ScoreInputs } from './sources/openfda/score.js'
export { PATTERNS, sentenceMentionsDrugClass, type Pattern } from './sources/openfda/patterns.js'
export type {
  CandidatePair,
  LabelRecord,
  ResolvedDrug,
  ResolutionQuality,
  ResolverFn,
} from './sources/openfda/types.js'

export { validateFiles, canonicalPairKey, expectedFilename } from './sources/community/validate.js'
export { communityEntrySchema, type CommunityEntry } from './sources/community/schemas.js'
