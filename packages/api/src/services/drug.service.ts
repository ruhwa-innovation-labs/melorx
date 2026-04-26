import { eq, ilike, sql } from 'drizzle-orm'
import { drugConcept, type Db } from '@melorx/core'

/**
 * Resolve a free-form drug query to a drug_concept row.
 *
 * Precedence (first match wins):
 *   1. RxCUI exact match
 *   2. NDC contained in identifiers.ndc JSONB array
 *   3. Brand name contained in identifiers.brand_names JSONB array (case-insensitive)
 *   4. Canonical name ilike match
 */
export async function resolveDrug(db: Db, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return null

  const [byCui] = await db
    .select()
    .from(drugConcept)
    .where(eq(drugConcept.rxcui, trimmed))
    .limit(1)
  if (byCui) return byCui

  const [byNdc] = await db
    .select()
    .from(drugConcept)
    .where(
      sql`${drugConcept.identifiers} -> 'ndc' @> ${JSON.stringify([trimmed])}::jsonb`,
    )
    .limit(1)
  if (byNdc) return byNdc

  const [byBrand] = await db
    .select()
    .from(drugConcept)
    .where(
      sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${drugConcept.identifiers} -> 'brand_names') AS brand
        WHERE lower(brand) = lower(${trimmed})
      )`,
    )
    .limit(1)
  if (byBrand) return byBrand

  const [byName] = await db
    .select()
    .from(drugConcept)
    .where(ilike(drugConcept.name, trimmed))
    .limit(1)

  return byName ?? null
}

export async function getDrugByCui(db: Db, rxcui: string) {
  const [drug] = await db
    .select()
    .from(drugConcept)
    .where(eq(drugConcept.rxcui, rxcui))
    .limit(1)

  return drug ?? null
}
