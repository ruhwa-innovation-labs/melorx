import { and, or, eq, isNull, gte, inArray } from 'drizzle-orm'
import {
  drugClassInteraction,
  drugInteraction,
  type Db,
  type InteractionResult,
  type InteractionSource,
  type Severity,
} from '@melo-rx/core'
import { resolveDrug } from './drug.service.js'

type ResolvedDrug = Awaited<ReturnType<typeof resolveDrug>> & object

type InteractionRecord = InteractionResult['interactions'][number]

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

  const [pairMatches, classMatches] = await Promise.all([
    queryConcretePair(db, drug1.rxcui, drug2.rxcui),
    queryClassRuleMatches(db, drug1, drug2),
  ])

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
    interactions: [...pairMatches, ...classMatches],
  }
}

async function queryConcretePair(
  db: Db,
  rxcui1: string,
  rxcui2: string,
): Promise<InteractionRecord[]> {
  // Query both orderings since the unique constraint only covers one direction.
  // Only return rows where confidence is NULL (curated) or >= 0.75 (NLP-extracted).
  const rows = await db
    .select()
    .from(drugInteraction)
    .where(
      and(
        or(
          and(
            eq(drugInteraction.drug1Rxcui, rxcui1),
            eq(drugInteraction.drug2Rxcui, rxcui2),
          ),
          and(
            eq(drugInteraction.drug1Rxcui, rxcui2),
            eq(drugInteraction.drug2Rxcui, rxcui1),
          ),
        ),
        or(
          isNull(drugInteraction.confidence),
          gte(drugInteraction.confidence, '0.75'),
        ),
      ),
    )

  return rows.map((row) => ({
    severity: row.severity satisfies Severity,
    mechanism: row.mechanism ?? null,
    management: row.management ?? null,
    sources: (row.sources ?? []) as InteractionSource[],
    confidence: row.confidence !== null ? Number(row.confidence) : null,
  }))
}

async function queryClassRuleMatches(
  db: Db,
  drug1: ResolvedDrug,
  drug2: ResolvedDrug,
): Promise<InteractionRecord[]> {
  const classes1 = drug1.drugClass ?? []
  const classes2 = drug2.drugClass ?? []
  if (classes1.length === 0 || classes2.length === 0) return []

  const rows = await db
    .select()
    .from(drugClassInteraction)
    .where(
      or(
        and(
          inArray(drugClassInteraction.classA, classes1),
          inArray(drugClassInteraction.classB, classes2),
        ),
        and(
          inArray(drugClassInteraction.classA, classes2),
          inArray(drugClassInteraction.classB, classes1),
        ),
      ),
    )

  return rows.map((row) => ({
    severity: row.severity satisfies Severity,
    mechanism: row.mechanism ?? null,
    management: row.management ?? null,
    sources: (row.sources ?? []) as InteractionSource[],
    confidence: null,
  }))
}
