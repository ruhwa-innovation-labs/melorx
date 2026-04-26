import { and, eq, gte, inArray, or, sql } from 'drizzle-orm'
import {
  drugConcept,
  drugInteraction,
  drugInteractionReview,
  logger,
  type Db,
} from '@melorx/core'

export interface PromoteCounters {
  eligible: number
  promoted: number
  blockedMissingConcept: number
  blockedExistingPair: number
}

/**
 * Promotes eligible review-queue rows into `drug_interaction`.
 *
 * A row is eligible when:
 *   - status = 'pending'
 *   - confidence >= 0.75  (Non-Negotiable Rule #6)
 *   - both drug1_rxcui and drug2_rxcui exist in drug_concept (FK)
 *   - no existing drug_interaction row covers the same (ordered or swapped) pair
 *
 * The 0.75 confidence threshold is bolted into the DB query filter AND the
 * query engine read filter (packages/api/src/services/interaction.service.ts).
 * Changing this value requires an ADR amendment.
 */
export async function promoteReviewQueue(db: Db): Promise<PromoteCounters> {
  const counters: PromoteCounters = {
    eligible: 0,
    promoted: 0,
    blockedMissingConcept: 0,
    blockedExistingPair: 0,
  }

  const eligibleRows = await db
    .select()
    .from(drugInteractionReview)
    .where(
      and(
        eq(drugInteractionReview.status, 'pending'),
        gte(drugInteractionReview.confidence, '0.75'),
      ),
    )

  counters.eligible = eligibleRows.length
  if (eligibleRows.length === 0) return counters

  const allRxcuis = new Set<string>()
  for (const row of eligibleRows) {
    allRxcuis.add(row.drug1Rxcui)
    allRxcuis.add(row.drug2Rxcui)
  }

  const existingConcepts = await db
    .select({ rxcui: drugConcept.rxcui })
    .from(drugConcept)
    .where(inArray(drugConcept.rxcui, [...allRxcuis]))

  const knownCuis = new Set(existingConcepts.map((c) => c.rxcui))

  for (const row of eligibleRows) {
    if (!knownCuis.has(row.drug1Rxcui) || !knownCuis.has(row.drug2Rxcui)) {
      counters.blockedMissingConcept++
      continue
    }

    const existingPair = await db
      .select({ id: drugInteraction.id })
      .from(drugInteraction)
      .where(
        or(
          and(
            eq(drugInteraction.drug1Rxcui, row.drug1Rxcui),
            eq(drugInteraction.drug2Rxcui, row.drug2Rxcui),
          ),
          and(
            eq(drugInteraction.drug1Rxcui, row.drug2Rxcui),
            eq(drugInteraction.drug2Rxcui, row.drug1Rxcui),
          ),
        ),
      )
      .limit(1)

    if (existingPair.length > 0) {
      counters.blockedExistingPair++
      await db
        .update(drugInteractionReview)
        .set({
          status: 'approved',
          reviewedBy: 'system:promote',
          reviewedAt: new Date(),
          promotedInteractionId: existingPair[0]!.id,
          updatedAt: new Date(),
        })
        .where(eq(drugInteractionReview.id, row.id))
      continue
    }

    const inserted = await db
      .insert(drugInteraction)
      .values({
        drug1Rxcui: row.drug1Rxcui,
        drug2Rxcui: row.drug2Rxcui,
        severity: row.severity,
        mechanism: row.mechanism,
        management: row.management,
        sources: row.sources,
        isGenerated: false,
        confidence: row.confidence,
      })
      .returning({ id: drugInteraction.id })

    const newId = inserted[0]?.id
    if (!newId) {
      logger.warn(`promote: failed to insert ${row.drug1Rxcui}+${row.drug2Rxcui}`)
      continue
    }

    await db
      .update(drugInteractionReview)
      .set({
        status: 'approved',
        reviewedBy: 'system:promote',
        reviewedAt: new Date(),
        promotedInteractionId: newId,
        updatedAt: new Date(),
      })
      .where(eq(drugInteractionReview.id, row.id))

    counters.promoted++
  }

  return counters
}

/** Dynamic health probe used by CI: returns a count of rows that SHOULD be in review but aren't gated correctly. Always 0 in a healthy system. */
export async function countUngatedLowConfidenceRows(db: Db): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(drugInteraction)
    .where(
      and(
        sql`${drugInteraction.confidence} IS NOT NULL`,
        sql`${drugInteraction.confidence} < 0.75`,
      ),
    )
  return rows[0]?.count ?? 0
}
