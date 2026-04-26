import { logger, type Db } from '@melorx/core'
import { extractFromLabel } from './extract.js'
import { toLabelRecord, type OpenFdaLabelJson } from './parse-label.js'
import { persistCandidatesToReviewQueue } from './persist.js'
import type { CandidatePair, ResolverFn } from './types.js'

export interface PartitionIngestCounters {
  labels: number
  labelsSkipped: number
  candidates: number
  inserted: number
  deduped: number
  classReferences: number
  unresolved: number
}

export interface OpenFdaPartitionJson {
  results: OpenFdaLabelJson[]
}

/**
 * Runs the extract → persist pipeline over a parsed OpenFDA partition JSON
 * object. The actual network download, checksum verification, and file I/O
 * live elsewhere — this function is pure database + extraction logic so it
 * can be exercised in integration tests without mocking HTTP.
 *
 * `resolve` is injected so callers can plug in the real resolver
 * (pipeline/resolver/) or a test stub.
 */
export async function ingestOpenFdaPartition(
  db: Db,
  partition: OpenFdaPartitionJson,
  resolve: ResolverFn,
): Promise<PartitionIngestCounters> {
  const counters: PartitionIngestCounters = {
    labels: 0,
    labelsSkipped: 0,
    candidates: 0,
    inserted: 0,
    deduped: 0,
    classReferences: 0,
    unresolved: 0,
  }

  const allCandidates: CandidatePair[] = []

  for (const labelJson of partition.results ?? []) {
    counters.labels++
    const labelRecord = toLabelRecord(labelJson)
    if (!labelRecord) {
      counters.labelsSkipped++
      continue
    }

    const extracted = extractFromLabel(labelRecord, resolve)
    allCandidates.push(...extracted.candidates)
    counters.candidates += extracted.candidates.length
    counters.classReferences += extracted.classReferences.length
    counters.unresolved += extracted.unresolved.length
  }

  const persist = await persistCandidatesToReviewQueue(db, allCandidates)
  counters.inserted = persist.inserted
  counters.deduped = persist.deduped

  logger.info(
    `OpenFDA partition ingested: labels=${counters.labels} skipped=${counters.labelsSkipped} candidates=${counters.candidates} inserted=${counters.inserted} deduped=${counters.deduped} class_refs=${counters.classReferences} unresolved=${counters.unresolved}`,
  )

  return counters
}
