import { eq, ilike, sql } from 'drizzle-orm'
import { drugConcept, type Db } from '@melorx/core'
import type { ResolvedDrug, ResolverFn } from './types.js'

/**
 * Adapts the drug_concept table into the synchronous ResolverFn shape that
 * extract.ts expects. Returns a closure that caches lookups per ingestion run
 * to avoid re-querying the DB for the same surface form across many labels.
 *
 * Match precedence:
 *   1. Canonical name (lowercase exact)  → quality: 'exact'
 *   2. Brand name contained in identifiers.brand_names (lowercase exact) → 'exact'
 *   3. Name ilike match (case-insensitive fuzzy) → 'approximate'
 */
export async function createResolverFn(db: Db): Promise<ResolverFn> {
  const cache = new Map<string, ResolvedDrug | null>()

  // Pre-load the whole drug_concept table into memory. With the current seed
  // footprint (~thousands of rows), this is negligible and eliminates a DB
  // roundtrip per pattern hit.
  const rows = await db.select().from(drugConcept)
  const byName = new Map<string, { rxcui: string; name: string }>()
  const byBrand = new Map<string, { rxcui: string; name: string }>()
  for (const row of rows) {
    byName.set(row.name.toLowerCase(), { rxcui: row.rxcui, name: row.name })
    const brands = (row.identifiers?.brand_names ?? []) as string[]
    for (const brand of brands) {
      byBrand.set(brand.toLowerCase(), { rxcui: row.rxcui, name: row.name })
    }
  }

  return (surfaceForm: string): ResolvedDrug | null => {
    const key = surfaceForm.trim().toLowerCase()
    if (!key) return null
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const exactByName = byName.get(key)
    if (exactByName) {
      const result: ResolvedDrug = { ...exactByName, quality: 'exact' }
      cache.set(key, result)
      return result
    }
    const exactByBrand = byBrand.get(key)
    if (exactByBrand) {
      const result: ResolvedDrug = { ...exactByBrand, quality: 'exact' }
      cache.set(key, result)
      return result
    }
    cache.set(key, null)
    return null
  }
}

/**
 * Strict on-demand resolver variant. Unlike `createResolverFn` (which
 * pre-loads the entire table), this version queries the DB per lookup. Use
 * when the dataset is too large to hold in memory; current dataset size
 * doesn't require it.
 */
export async function lookupDrugConcept(
  db: Db,
  surfaceForm: string,
): Promise<ResolvedDrug | null> {
  const trimmed = surfaceForm.trim()
  if (!trimmed) return null

  const [exactByName] = await db
    .select({ rxcui: drugConcept.rxcui, name: drugConcept.name })
    .from(drugConcept)
    .where(sql`lower(${drugConcept.name}) = lower(${trimmed})`)
    .limit(1)
  if (exactByName) return { ...exactByName, quality: 'exact' }

  const [exactByBrand] = await db
    .select({ rxcui: drugConcept.rxcui, name: drugConcept.name })
    .from(drugConcept)
    .where(
      sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${drugConcept.identifiers} -> 'brand_names') AS brand
        WHERE lower(brand) = lower(${trimmed})
      )`,
    )
    .limit(1)
  if (exactByBrand) return { ...exactByBrand, quality: 'exact' }

  const [fuzzy] = await db
    .select({ rxcui: drugConcept.rxcui, name: drugConcept.name })
    .from(drugConcept)
    .where(ilike(drugConcept.name, `%${trimmed}%`))
    .limit(1)
  if (fuzzy) return { ...fuzzy, quality: 'approximate' }

  return null
}
