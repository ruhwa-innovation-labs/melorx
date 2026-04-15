import { and, or, eq, isNull, gte } from 'drizzle-orm'
import { drugInteraction, type Db, type InteractionResult, type InteractionSource } from '@melo-rx/core'
import { resolveDrug } from './drug.service.js'

export async function checkInteraction(
  db: Db,
  drug1Query: string,
  drug2Query: string,
): Promise<InteractionResult | { notFound: string }> {
  const [drug1, drug2] = await Promise.all([
    resolveDrug(db, drug1Query),
    resolveDrug(db, drug2Query),
  ])

  if (!drug1) return { notFound: drug1Query }
  if (!drug2) return { notFound: drug2Query }

  // Query both orderings since the unique constraint only covers one direction.
  // Only return rows where confidence is NULL (curated) or >= 0.75 (NLP-extracted).
  const rows = await db
    .select()
    .from(drugInteraction)
    .where(
      and(
        or(
          and(
            eq(drugInteraction.drug1Rxcui, drug1.rxcui),
            eq(drugInteraction.drug2Rxcui, drug2.rxcui),
          ),
          and(
            eq(drugInteraction.drug1Rxcui, drug2.rxcui),
            eq(drugInteraction.drug2Rxcui, drug1.rxcui),
          ),
        ),
        or(
          isNull(drugInteraction.confidence),
          gte(drugInteraction.confidence, '0.75'),
        ),
      ),
    )

  return {
    drug1: {
      rxcui: drug1.rxcui,
      name: drug1.name,
      classes: drug1.drugClass ?? [],
    },
    drug2: {
      rxcui: drug2.rxcui,
      name: drug2.name,
      classes: drug2.drugClass ?? [],
    },
    interactions: rows.map((row) => ({
      severity: row.severity,
      mechanism: row.mechanism ?? null,
      management: row.management ?? null,
      sources: ((row.sources ?? []) as InteractionSource[]),
      confidence: row.confidence !== null ? Number(row.confidence) : null,
    })),
  }
}
