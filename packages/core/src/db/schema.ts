import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  jsonb,
  boolean,
  numeric,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const severityPgEnum = pgEnum('severity_enum', [
  'contraindicated',
  'serious',
  'moderate',
  'minor',
  'monitor',
])

export const drugConcept = pgTable('drug_concept', {
  id: uuid('id').defaultRandom().primaryKey(),
  rxcui: varchar('rxcui').unique().notNull(),
  name: varchar('name').notNull(),
  drugClass: varchar('drug_class').array().default([]),
  identifiers: jsonb('identifiers').notNull().default({}),
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
    sources: jsonb('sources').array().notNull().default([]),
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
    sources: jsonb('sources').array().notNull().default([]),
    classRuleId: uuid('class_rule_id').references(
      () => drugClassInteraction.id,
    ),
    isGenerated: boolean('is_generated').default(false),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    drugPairUnique: unique().on(table.drug1Rxcui, table.drug2Rxcui),
  }),
)
