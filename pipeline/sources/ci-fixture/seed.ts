/**
 * CI-only minimal fixture seed.
 *
 * Runs in GitHub Actions after `pnpm db:seed` to provide the tiny slice of
 * RxNorm-derived data that API integration tests need, *without* shipping
 * the 1.2 GB RxNorm RRF files to CI. Covers:
 *
 *   - simvastatin (36567): brand_names includes "Zocor"; ndc includes
 *     "00574171015"; drug_class = ["Simvastatin and lovastatin"].
 *   - clarithromycin (21212): inserted as a new concept with
 *     drug_class = ["CYP3A4 inhibitors (macrolides and related)"].
 *   - One `drug_class_interaction` row matching the two classes at
 *     `contraindicated` severity — this is the exact rule that
 *     `interactions.test.ts` > "expands class rules at query time" exercises.
 *
 * Local developers should run the real enrichment pipeline
 * (`pnpm db:seed:classes` + `pnpm db:enrich`) instead — that populates
 * thousands of rows. This script is surgically scoped to CI.
 */

import { and, eq, or, sql } from 'drizzle-orm'
import {
  createDb,
  drugClassInteraction,
  drugConcept,
  logger,
} from '@melorx/core'
import type { InteractionSource } from '@melorx/core'

const SOURCE: InteractionSource = {
  name: 'ONCHigh',
  url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3817532/',
  type: 'clinical_guideline',
  accessed_date: '2026-04-15',
}

async function seed(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')
  const db = createDb(url)

  // 1. Enrich simvastatin with class + brand + one NDC (the value the tests use).
  await db
    .insert(drugConcept)
    .values({
      rxcui: '36567',
      name: 'simvastatin',
      drugClass: ['Simvastatin and lovastatin'],
      identifiers: {
        ndc: ['00574171015'],
        atc: 'C10AA01',
        drugbank: null,
        brand_names: ['Zocor'],
      },
    })
    .onConflictDoUpdate({
      target: drugConcept.rxcui,
      set: {
        drugClass: ['Simvastatin and lovastatin'],
        identifiers: sql`jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(${drugConcept.identifiers}, '{}'::jsonb),
              '{brand_names}',
              '["Zocor"]'::jsonb
            ),
            '{ndc}',
            '["00574171015"]'::jsonb
          ),
          '{atc}',
          '"C10AA01"'::jsonb
        )`,
      },
    })

  // 2. Insert clarithromycin as a new concept carrying its class label.
  await db
    .insert(drugConcept)
    .values({
      rxcui: '21212',
      name: 'Clarithromycin',
      drugClass: ['CYP3A4 inhibitors (macrolides and related)'],
      identifiers: { ndc: [], atc: 'J01FA09', drugbank: null, brand_names: ['Biaxin'] },
    })
    .onConflictDoUpdate({
      target: drugConcept.rxcui,
      set: {
        drugClass: ['CYP3A4 inhibitors (macrolides and related)'],
      },
    })

  // 3. Insert the class-interaction rule that makes simvastatin+clarithromycin
  //    return contraindicated via query-time expansion.
  const existing = await db
    .select({ id: drugClassInteraction.id })
    .from(drugClassInteraction)
    .where(
      or(
        and(
          eq(drugClassInteraction.classA, 'Simvastatin and lovastatin'),
          eq(drugClassInteraction.classB, 'CYP3A4 inhibitors (macrolides and related)'),
        ),
        and(
          eq(drugClassInteraction.classA, 'CYP3A4 inhibitors (macrolides and related)'),
          eq(drugClassInteraction.classB, 'Simvastatin and lovastatin'),
        ),
      ),
    )
    .limit(1)

  if (existing.length === 0) {
    await db.insert(drugClassInteraction).values({
      classA: 'Simvastatin and lovastatin',
      classB: 'CYP3A4 inhibitors (macrolides and related)',
      severity: 'contraindicated',
      mechanism:
        'Simvastatin and lovastatin are extensively metabolized by CYP3A4; strong inhibitors elevate statin plasma exposure and risk of myopathy and rhabdomyolysis.',
      management:
        'Avoid co-administration. Consider a statin not metabolised by CYP3A4 (pravastatin, rosuvastatin) or limit dose per labelling.',
      sources: [SOURCE],
    })
  }

  logger.info('CI fixture seed complete: simvastatin enriched, clarithromycin inserted, class rule present')
}

seed().catch((err) => {
  logger.error({ err }, 'CI fixture seed failed')
  process.exit(1)
})
