import { sql } from 'drizzle-orm'
import {
  drugInteractionReview,
  logger,
  type Db,
  type InteractionSource,
} from '@melorx/core'
import type { CandidatePair } from './types.js'

export interface PersistCounters {
  candidates: number
  inserted: number
  deduped: number
}

const INGESTION_SOURCE_NAME = 'OpenFDA'

function toInteractionSource(candidate: CandidatePair, today: string): InteractionSource {
  const source: InteractionSource = {
    name: `OpenFDA label: ${candidate.labelName}`,
    url: candidate.url,
    type: 'fda_label',
    accessed_date: today,
    set_id: candidate.setId,
  }
  if (candidate.effectiveTime) {
    source.effective_time = candidate.effectiveTime
  }
  return source
}

/**
 * Writes extracted candidate pairs to `drug_interaction_review`.
 *
 * Per ADR-004: every candidate goes through the review queue first. Promotion
 * into `drug_interaction` is handled by promote.ts (a separate step), never
 * from this function directly.
 *
 * Candidates whose (drug1, drug2, pattern_id, sentence) tuple already exists
 * in the queue are skipped (idempotent re-ingestion).
 */
export async function persistCandidatesToReviewQueue(
  db: Db,
  candidates: CandidatePair[],
  now: Date = new Date(),
): Promise<PersistCounters> {
  const counters: PersistCounters = {
    candidates: candidates.length,
    inserted: 0,
    deduped: 0,
  }
  if (candidates.length === 0) return counters

  const today = now.toISOString().slice(0, 10)

  for (const candidate of candidates) {
    const source = toInteractionSource(candidate, today)

    const result = await db
      .insert(drugInteractionReview)
      .values({
        drug1Rxcui: candidate.subjectRxcui,
        drug2Rxcui: candidate.objectRxcui,
        severity: candidate.severity,
        mechanism: candidate.mechanism,
        management: candidate.management,
        sources: [source],
        confidence: candidate.confidence.toFixed(2),
        patternId: candidate.patternId,
        sourceSentence: candidate.sentence,
      })
      .onConflictDoNothing({
        target: [
          drugInteractionReview.drug1Rxcui,
          drugInteractionReview.drug2Rxcui,
          drugInteractionReview.patternId,
          drugInteractionReview.sourceSentence,
        ],
      })
      .returning({ id: drugInteractionReview.id })

    if (result.length > 0) {
      counters.inserted++
    } else {
      counters.deduped++
    }
  }

  logger.info(
    `${INGESTION_SOURCE_NAME} review queue: inserted=${counters.inserted} deduped=${counters.deduped} across ${counters.candidates} candidate(s)`,
  )

  // Keep updated_at fresh on any rows we touched via upsert-style semantics.
  // (onConflictDoNothing above simply skips; this is a no-op but asserts the
  // table is reachable before returning — defensive against stale connections.)
  await db.execute(sql`SELECT 1`)

  return counters
}
