import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, or, and } from 'drizzle-orm'
import { createDb, drugConcept, drugInteraction } from '@melo-rx/core'
import { seedFileSchema } from './schemas.js'
import { transformEntry } from './transform.js'

async function seed(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')

  const db = createDb(url)

  const seedPath = resolve(
    new URL('.', import.meta.url).pathname,
    'data/seed.json',
  )
  const raw: unknown = JSON.parse(readFileSync(seedPath, 'utf-8'))
  const entries = seedFileSchema.parse(raw)

  console.log(`Seeding ${entries.length} ONCHigh interactions...`)

  let inserted = 0
  let skipped = 0

  for (const entry of entries) {
    const t = transformEntry(entry)

    await db
      .insert(drugConcept)
      .values({
        rxcui: t.drug1.rxcui,
        name: t.drug1.name,
        drugClass: [],
        identifiers: { ndc: [], atc: null, drugbank: null, brand_names: [] },
      })
      .onConflictDoNothing()

    await db
      .insert(drugConcept)
      .values({
        rxcui: t.drug2.rxcui,
        name: t.drug2.name,
        drugClass: [],
        identifiers: { ndc: [], atc: null, drugbank: null, brand_names: [] },
      })
      .onConflictDoNothing()

    const existing = await db
      .select({ id: drugInteraction.id })
      .from(drugInteraction)
      .where(
        or(
          and(
            eq(drugInteraction.drug1Rxcui, t.drug1.rxcui),
            eq(drugInteraction.drug2Rxcui, t.drug2.rxcui),
          ),
          and(
            eq(drugInteraction.drug1Rxcui, t.drug2.rxcui),
            eq(drugInteraction.drug2Rxcui, t.drug1.rxcui),
          ),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(drugInteraction).values({
      drug1Rxcui: t.drug1.rxcui,
      drug2Rxcui: t.drug2.rxcui,
      severity: t.severity,
      mechanism: t.mechanism,
      management: t.management,
      sources: t.sources,
      isGenerated: false,
      confidence: null,
    })

    inserted++
  }

  console.log(`Done. Inserted: ${inserted}, Skipped (already present): ${skipped}`)
  process.exit(0)
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
