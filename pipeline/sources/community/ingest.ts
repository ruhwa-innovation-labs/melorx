import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { and, eq, or } from 'drizzle-orm'
import { createDb, drugConcept, drugInteraction, logger } from '@melorx/core'
import type { InteractionSource } from '@melorx/core'
import { validateFiles } from './validate.js'
import type { CommunityEntry } from './schemas.js'

interface IngestCounters {
  files: number
  inserted: number
  skippedExisting: number
  missingConcept: number
}

function toInteractionSources(entry: CommunityEntry): InteractionSource[] {
  return entry.sources.map((s) => ({
    name: s.name,
    url: s.url,
    type: s.type,
    accessed_date: s.accessed_date,
  }))
}

async function ingest(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')

  const db = createDb(url)
  const pairsDir = resolve(
    new URL('.', import.meta.url).pathname,
    'pairs',
  )

  const files = readdirSync(pairsDir)
    .filter((n) => n.endsWith('.json'))
    .filter((n) => !statSync(join(pairsDir, n)).isDirectory())
    .sort()

  const inputs = files.map((name) => ({
    file: name,
    content: readFileSync(join(pairsDir, name), 'utf-8'),
  }))

  const { entries, issues } = validateFiles(inputs)

  if (issues.length > 0) {
    for (const issue of issues) {
      logger.error(`validation failure: ${issue.file} [${issue.path}]: ${issue.message}`)
    }
    throw new Error(`community ingestion aborted: ${issues.length} validation issue(s)`)
  }

  const counters: IngestCounters = {
    files: entries.length,
    inserted: 0,
    skippedExisting: 0,
    missingConcept: 0,
  }

  for (const { entry } of entries) {
    const concepts = await db
      .select({ rxcui: drugConcept.rxcui })
      .from(drugConcept)
      .where(
        or(
          eq(drugConcept.rxcui, entry.drug1.rxcui),
          eq(drugConcept.rxcui, entry.drug2.rxcui),
        ),
      )

    const foundRxcuis = new Set(concepts.map((c) => c.rxcui))
    if (!foundRxcuis.has(entry.drug1.rxcui) || !foundRxcuis.has(entry.drug2.rxcui)) {
      counters.missingConcept++
      logger.warn(
        `skipping ${entry.drug1.rxcui}+${entry.drug2.rxcui}: one or both RxCUIs absent from drug_concept (run resolver enrichment first)`,
      )
      continue
    }

    const existing = await db
      .select({ id: drugInteraction.id })
      .from(drugInteraction)
      .where(
        or(
          and(
            eq(drugInteraction.drug1Rxcui, entry.drug1.rxcui),
            eq(drugInteraction.drug2Rxcui, entry.drug2.rxcui),
          ),
          and(
            eq(drugInteraction.drug1Rxcui, entry.drug2.rxcui),
            eq(drugInteraction.drug2Rxcui, entry.drug1.rxcui),
          ),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      counters.skippedExisting++
      continue
    }

    await db.insert(drugInteraction).values({
      drug1Rxcui: entry.drug1.rxcui,
      drug2Rxcui: entry.drug2.rxcui,
      severity: entry.severity,
      mechanism: entry.mechanism,
      management: entry.management,
      sources: toInteractionSources(entry),
      isGenerated: false,
      confidence: null,
    })
    counters.inserted++
  }

  logger.info(
    `community ingest complete: ${counters.inserted} inserted, ${counters.skippedExisting} skipped (existing), ${counters.missingConcept} skipped (missing concept) across ${counters.files} file(s)`,
  )
}

ingest().catch((err) => {
  logger.error({ err }, 'community ingestion failed')
  process.exit(1)
})
