import { eq } from 'drizzle-orm'
import { createDb, drugConcept, logger } from '@melo-rx/core'
import { loadIdentifierIndex } from './rxnorm-identifiers.js'
import {
  mergeIdentifiers,
  identifiersEqual,
  type DrugConceptIdentifiers,
} from './merge-identifiers.js'

interface EnrichResult {
  scanned: number
  enriched: number
  unchanged: number
  noMatch: number
}

async function enrich(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')

  const db = createDb(url)
  const index = await loadIdentifierIndex()
  logger.info(
    `Loaded RxNorm identifier index (${index.size} ingredient RxCUIs with ATC / brand / NDC data)`,
  )

  const rows = await db
    .select({
      rxcui: drugConcept.rxcui,
      identifiers: drugConcept.identifiers,
    })
    .from(drugConcept)

  logger.info(`Scanning ${rows.length} drug_concept rows for enrichment`)

  const result: EnrichResult = {
    scanned: rows.length,
    enriched: 0,
    unchanged: 0,
    noMatch: 0,
  }

  for (const row of rows) {
    const incoming = index.get(row.rxcui)
    if (!incoming) {
      result.noMatch++
      continue
    }
    const existing = row.identifiers as DrugConceptIdentifiers | undefined
    const merged = mergeIdentifiers(existing, incoming)
    if (merged === null || identifiersEqual(existing, merged)) {
      result.unchanged++
      continue
    }
    await db
      .update(drugConcept)
      .set({ identifiers: merged })
      .where(eq(drugConcept.rxcui, row.rxcui))
    result.enriched++
  }

  logger.info(
    `drug_concept enrichment complete. scanned=${result.scanned}, enriched=${result.enriched}, unchanged=${result.unchanged}, no-match=${result.noMatch}`,
  )
  await db.$client.end()
}

enrich().catch((err: unknown) => {
  logger.error({ err }, 'drug_concept enrichment failed')
  process.exitCode = 1
})
