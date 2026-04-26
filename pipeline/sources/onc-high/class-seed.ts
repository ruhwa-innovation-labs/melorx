import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, or } from 'drizzle-orm'
import { createDb, drugClassInteraction, drugConcept, logger } from '@melorx/core'
import {
  loadIngredientIndex,
  resolveIngredient,
  type IngredientRecord,
} from '../../resolver/rxnorm-ingredients.js'
import {
  loadIdentifierIndex,
  type IngredientIdentifiers,
} from '../../resolver/rxnorm-identifiers.js'
import {
  mergeIdentifiers,
  identifiersEqual,
  type DrugConceptIdentifiers,
} from '../../resolver/merge-identifiers.js'
import { classRulesFileSchema } from './class-schemas.js'
import { collectDrugMemberships } from './class-drugs.js'
import { toClassInteractionRows } from './class-transform.js'
import type { ClassRulesFile } from './class-types.js'

async function seed(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('DATABASE_URL environment variable is required')

  const db = createDb(url)

  const file = loadClassRules()
  logger.info(
    `Loaded ${file.rules.length} ONCHigh class rules (${file.deferred_rules.length} deferred)`,
  )

  const ingredientIndex = await loadIngredientIndex()
  logger.info(`Loaded RxNorm ingredient index (${ingredientIndex.size} entries)`)

  const identifierIndex = await loadIdentifierIndex()
  logger.info(
    `Loaded RxNorm identifier index (${identifierIndex.size} ingredient RxCUIs with ATC and/or brand names)`,
  )

  const memberships = collectDrugMemberships(file)
  const conceptResult = await upsertDrugConcepts(
    db,
    memberships,
    ingredientIndex,
    identifierIndex,
  )
  logger.info(
    `drug_concept: inserted ${conceptResult.inserted}, classes-updated ${conceptResult.updated}, identifiers-updated ${conceptResult.identifiersUpdated}, unresolved ${conceptResult.unresolved.length}`,
  )
  if (conceptResult.unresolved.length > 0) {
    logger.warn({ unresolved: conceptResult.unresolved }, 'Drugs without RxNorm ingredient match')
  }

  const rows = toClassInteractionRows(file)
  const classResult = await upsertClassRules(db, rows)
  logger.info(
    `drug_class_interaction: inserted ${classResult.inserted}, skipped ${classResult.skipped}`,
  )

  await db.$client.end()
}

function loadClassRules(): ClassRulesFile {
  const rulesPath = resolve(
    new URL('.', import.meta.url).pathname,
    'data/class-rules.json',
  )
  const raw: unknown = JSON.parse(readFileSync(rulesPath, 'utf-8'))
  return classRulesFileSchema.parse(raw)
}

interface ConceptResult {
  inserted: number
  updated: number
  identifiersUpdated: number
  unresolved: string[]
}

async function upsertDrugConcepts(
  db: ReturnType<typeof createDb>,
  memberships: Map<string, Set<string>>,
  ingredientIndex: Map<string, IngredientRecord>,
  identifierIndex: Map<string, IngredientIdentifiers>,
): Promise<ConceptResult> {
  const result: ConceptResult = {
    inserted: 0,
    updated: 0,
    identifiersUpdated: 0,
    unresolved: [],
  }

  const byRxcui = new Map<string, { name: string; classes: Set<string> }>()
  for (const [rawName, classSet] of memberships) {
    const record = resolveIngredient(ingredientIndex, rawName)
    if (!record) {
      result.unresolved.push(rawName)
      continue
    }
    const entry = byRxcui.get(record.rxcui)
    if (entry) {
      for (const c of classSet) entry.classes.add(c)
    } else {
      byRxcui.set(record.rxcui, { name: record.name, classes: new Set(classSet) })
    }
  }

  for (const [rxcui, entry] of byRxcui) {
    const identifiers = identifierIndex.get(rxcui)
    const existing = await db
      .select({
        drugClass: drugConcept.drugClass,
        identifiers: drugConcept.identifiers,
      })
      .from(drugConcept)
      .where(eq(drugConcept.rxcui, rxcui))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(drugConcept).values({
        rxcui,
        name: entry.name,
        drugClass: [...entry.classes].sort(),
        identifiers: {
          ndc: identifiers?.ndc ?? [],
          atc: identifiers?.atc ?? null,
          drugbank: null,
          brand_names: identifiers?.brand_names ?? [],
        },
      })
      result.inserted++
      continue
    }

    const current = new Set(existing[0]?.drugClass ?? [])
    const before = current.size
    for (const c of entry.classes) current.add(c)
    const classesChanged = current.size !== before

    const existingIdentifiers = existing[0]?.identifiers
    const mergedIdentifiers = mergeIdentifiers(existingIdentifiers, identifiers)
    const identifiersChanged =
      mergedIdentifiers !== null &&
      !identifiersEqual(existingIdentifiers, mergedIdentifiers)

    if (classesChanged || identifiersChanged) {
      const update: {
        drugClass?: string[]
        identifiers?: DrugConceptIdentifiers
      } = {}
      if (classesChanged) update.drugClass = [...current].sort()
      if (identifiersChanged && mergedIdentifiers !== null) {
        update.identifiers = mergedIdentifiers
      }

      await db
        .update(drugConcept)
        .set(update)
        .where(eq(drugConcept.rxcui, rxcui))

      if (classesChanged) result.updated++
      if (identifiersChanged) result.identifiersUpdated++
    }
  }

  return result
}

interface ClassResult {
  inserted: number
  skipped: number
}

async function upsertClassRules(
  db: ReturnType<typeof createDb>,
  rows: ReturnType<typeof toClassInteractionRows>,
): Promise<ClassResult> {
  const result: ClassResult = { inserted: 0, skipped: 0 }

  for (const row of rows) {
    const existing = await db
      .select({ id: drugClassInteraction.id })
      .from(drugClassInteraction)
      .where(
        or(
          and(
            eq(drugClassInteraction.classA, row.class_a),
            eq(drugClassInteraction.classB, row.class_b),
          ),
          and(
            eq(drugClassInteraction.classA, row.class_b),
            eq(drugClassInteraction.classB, row.class_a),
          ),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      result.skipped++
      continue
    }

    await db.insert(drugClassInteraction).values({
      classA: row.class_a,
      classB: row.class_b,
      severity: row.severity,
      mechanism: row.mechanism,
      management: row.management,
      sources: row.sources,
    })
    result.inserted++
  }

  return result
}

seed().catch((err: unknown) => {
  logger.error({ err }, 'ONCHigh class rules seed failed')
  process.exitCode = 1
})
