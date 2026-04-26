import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  numeric,
  timestamp,
  unique,
  integer,
} from 'drizzle-orm/pg-core'
import type { DrugIdentifiers } from '../types/drug-concept.js'
import type { InteractionSource } from '../types/drug-interaction.js'

export const severityPgEnum = pgEnum('severity_enum', [
  'contraindicated',
  'serious',
  'moderate',
  'minor',
  'monitor',
])

export const reviewStatusPgEnum = pgEnum('review_status_enum', [
  'pending',
  'approved',
  'rejected',
])

export const drugConcept = pgTable('drug_concept', {
  id: uuid('id').defaultRandom().primaryKey(),
  rxcui: varchar('rxcui').unique().notNull(),
  name: varchar('name').notNull(),
  drugClass: varchar('drug_class').array().notNull().default([]),
  identifiers: jsonb('identifiers').$type<DrugIdentifiers>().notNull().default({ ndc: [], atc: null, drugbank: null, brand_names: [] }),
})

export const drugClassInteraction = pgTable(
  'drug_class_interaction',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classA: varchar('class_a').notNull(),
    classB: varchar('class_b').notNull(),
    severity: severityPgEnum('severity').notNull(),
    mechanism: varchar('mechanism'),
    management: varchar('management'),
    sources: jsonb('sources').$type<InteractionSource>().array().notNull().default([]),
  },
  (table) => ({
    classPairUnique: unique().on(table.classA, table.classB),
  }),
)

export const drugInteraction = pgTable(
  'drug_interaction',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    drug1Rxcui: varchar('drug1_rxcui')
      .notNull()
      .references(() => drugConcept.rxcui),
    drug2Rxcui: varchar('drug2_rxcui')
      .notNull()
      .references(() => drugConcept.rxcui),
    severity: severityPgEnum('severity').notNull(),
    mechanism: varchar('mechanism'),
    management: varchar('management'),
    sources: jsonb('sources').$type<InteractionSource>().array().notNull().default([]),
    classRuleId: uuid('class_rule_id').references(
      () => drugClassInteraction.id,
    ),
    isGenerated: boolean('is_generated').notNull().default(false),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    drugPairUnique: unique().on(table.drug1Rxcui, table.drug2Rxcui),
  }),
)

/**
 * Staging table for NLP-extracted pairs awaiting promotion.
 * Rule #6: pairs with confidence < 0.75 cannot leave this table until reviewed.
 */
export const drugInteractionReview = pgTable(
  'drug_interaction_review',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    drug1Rxcui: varchar('drug1_rxcui').notNull(),
    drug2Rxcui: varchar('drug2_rxcui').notNull(),
    severity: severityPgEnum('severity').notNull(),
    mechanism: varchar('mechanism'),
    management: varchar('management'),
    sources: jsonb('sources').$type<InteractionSource>().array().notNull().default([]),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    patternId: varchar('pattern_id').notNull(),
    sourceSentence: text('source_sentence').notNull(),
    status: reviewStatusPgEnum('status').notNull().default('pending'),
    reviewedBy: varchar('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: varchar('rejection_reason'),
    promotedInteractionId: uuid('promoted_interaction_id').references(
      () => drugInteraction.id,
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    reviewPairUnique: unique().on(
      table.drug1Rxcui,
      table.drug2Rxcui,
      table.patternId,
      table.sourceSentence,
    ),
  }),
)

/**
 * Tracks incremental ingestion state per source partition.
 * Enables "download only partitions whose checksum has changed" semantics for OpenFDA.
 */
export const pipelineState = pgTable(
  'pipeline_state',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceName: varchar('source_name').notNull(),
    partitionId: varchar('partition_id').notNull(),
    checksum: varchar('checksum').notNull(),
    recordsProcessed: integer('records_processed').notNull().default(0),
    lastIngestedAt: timestamp('last_ingested_at').defaultNow().notNull(),
  },
  (table) => ({
    sourcePartitionUnique: unique().on(table.sourceName, table.partitionId),
  }),
)
