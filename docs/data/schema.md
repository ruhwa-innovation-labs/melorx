# Canonical Schema Reference

> **Document type:** Source of truth for database schema
> **Scope:** All tables, types, indexes, and constraints in the melo-rx data layer
> **Authority:** Code must match this document. When there is a conflict between a Drizzle
> migration and this document, this document wins and the migration must be corrected.

---

## Type: `severity_enum`

```sql
CREATE TYPE severity_enum AS ENUM (
  'contraindicated',
  'serious',
  'moderate',
  'minor',
  'monitor'
);
```

### Clinical Meaning

| Value | Clinical Meaning |
|-------|-----------------|
| `contraindicated` | The combination must never be co-administered. Benefit cannot outweigh the risk under any clinical circumstances. Maps to ONCHigh `contraindicated`. |
| `serious` | The combination should be avoided. Co-administration is only justifiable when no therapeutic alternative exists and the benefit is documented to outweigh the risk. Requires active clinical management. Maps to ONCHigh `serious` and DrugBank `major`. |
| `moderate` | Co-administration requires caution and monitoring. An alternative drug should be considered. The interaction is clinically significant but manageable. Maps to ONCHigh `significant` and DrugBank `moderate`. |
| `minor` | Minimal clinical significance. The interaction is documented but unlikely to require a change in therapy under typical clinical conditions. Maps to DrugBank `minor`. |
| `monitor` | The interaction is theoretical or based on weak evidence. No change in therapy is required, but the combination should be noted and the patient observed. Maps to ONCHigh `monitor`. |

The enum is ordered from most to least severe for documentation purposes only. PostgreSQL does
not enforce an order on enum comparisons unless `ORDER BY` is used.

All ingestion adapters must map source-specific severity strings to this enum before any INSERT
or UPDATE. Free-text severity values are rejected at the database constraint layer.

---

## Table: `drug_concept`

```sql
CREATE TABLE drug_concept (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui       VARCHAR     UNIQUE NOT NULL,
  name        VARCHAR     NOT NULL,
  drug_class  VARCHAR[],
  identifiers JSONB       NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX drug_concept_rxcui_idx
  ON drug_concept (rxcui);

CREATE INDEX drug_concept_drug_class_gin_idx
  ON drug_concept USING GIN (drug_class);

CREATE INDEX drug_concept_identifiers_gin_idx
  ON drug_concept USING GIN (identifiers);
```

### Field Reference

#### `id`
- Type: `UUID`
- Constraint: `PRIMARY KEY`, auto-generated via `gen_random_uuid()`
- Required: Yes (auto-populated)
- Description: Internal surrogate key. Never exposed as a public identifier in API responses.
  All external references use `rxcui`.

#### `rxcui`
- Type: `VARCHAR`
- Constraint: `UNIQUE NOT NULL`
- Required: Yes
- Description: The RxNorm Concept Unique Identifier. This is the canonical identifier for all
  drug concepts in the system. All interaction tables reference drugs by `rxcui`, not by `id`.
  All incoming queries are resolved to an `rxcui` by the Resolver Service before any interaction
  lookup occurs. Example value: `'5640'` (ibuprofen).

#### `name`
- Type: `VARCHAR`
- Constraint: `NOT NULL`
- Required: Yes
- Description: The canonical drug name as recorded in RxNorm. This is the display name returned
  in API responses. It is the ingredient name, not a brand name. Example: `'Ibuprofen'`.

#### `drug_class`
- Type: `VARCHAR[]`
- Constraint: None (nullable)
- Required: No
- Description: An array of pharmacological or therapeutic class names that this drug belongs to.
  A drug may belong to more than one class simultaneously. This column is the join target for
  class-level interaction expansion: the query engine compares this array against `class_a` and
  `class_b` in `drug_class_interaction` to find applicable class rules.
  Example value: `['NSAID', 'COX-2 inhibitor']`.
  Indexed with GIN for efficient array containment queries (`@>` operator).

#### `identifiers`
- Type: `JSONB`
- Constraint: `NOT NULL DEFAULT '{}'`
- Required: No (defaults to empty object)
- Description: Secondary identifier mappings used by the Resolver Service to translate incoming
  queries to an `rxcui`. The column is optional at the field level but the column itself is
  always present (empty object rather than NULL).

  **JSONB shape:**
  ```json
  {
    "ndc": ["0005-0118-23", "0005-0118-68"],
    "atc": "M01AE01",
    "drugbank": "DB01050",
    "brand_names": ["Advil", "Motrin", "Nuprin"]
  }
  ```

  | Field | Type | Description |
  |-------|------|-------------|
  | `ndc` | `string[]` | National Drug Codes. A single drug ingredient may have many NDCs across different manufacturers, strengths, and package sizes. Array, not scalar. |
  | `atc` | `string` | Anatomical Therapeutic Chemical code from the WHO classification system. Single value — the primary ATC code for the ingredient. |
  | `drugbank` | `string` | DrugBank compound identifier (e.g., `DB01050`). Present only if mapped. Used for reference, never for ingestion. |
  | `brand_names` | `string[]` | Known brand/trade names for this drug. Used by the Resolver Service for name-based lookups. Case-normalized to title case on ingestion. |

  All fields are optional within the JSONB object. The GIN index supports containment queries
  such as finding a drug by a specific NDC: `WHERE identifiers @> '{"ndc": ["0005-0118-23"]}'`.

---

## Table: `drug_class_interaction`

```sql
CREATE TABLE drug_class_interaction (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  class_a     VARCHAR       NOT NULL,
  class_b     VARCHAR       NOT NULL,
  severity    severity_enum NOT NULL,
  mechanism   TEXT,
  management  TEXT,
  sources     JSONB[]       NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX drug_class_interaction_pair_idx
  ON drug_class_interaction (class_a, class_b);
```

### Field Reference

#### `id`
- Type: `UUID`
- Constraint: `PRIMARY KEY`, auto-generated
- Required: Yes (auto-populated)
- Description: Internal surrogate key. Referenced by `drug_interaction.class_rule_id` to
  trace the origin of class-expanded interaction rows.

#### `class_a`
- Type: `VARCHAR`
- Constraint: `NOT NULL`
- Required: Yes
- Description: The first drug class in the interaction pair. Must match a value that appears in
  `drug_concept.drug_class[]`. Class names are stored in the canonical form used in `drug_concept`
  records (e.g., `'NSAID'`, `'ACE inhibitor'`, `'SSRI'`). The pair `(class_a, class_b)` is
  order-sensitive in storage but the query engine checks both orderings when expanding.
  Example: `'NSAID'`.

#### `class_b`
- Type: `VARCHAR`
- Constraint: `NOT NULL`
- Required: Yes
- Description: The second drug class in the interaction pair.
  Example: `'ACE inhibitor'`.

#### `severity`
- Type: `severity_enum`
- Constraint: `NOT NULL`
- Required: Yes
- Description: The canonical severity of the interaction at the class level. This severity
  propagates to all `drug_interaction` rows generated from this rule, unless a more specific
  direct pair record exists (in which case the direct record takes precedence).

#### `mechanism`
- Type: `TEXT`
- Constraint: None (nullable)
- Required: No
- Description: A plain-text description of the pharmacological mechanism underlying the
  interaction. Should be class-general, not drug-specific. Displayed verbatim in API responses.
  Example: `'NSAIDs inhibit renal prostaglandin synthesis, reducing the vasodilatory effect that
  ACE inhibitors rely on to lower blood pressure.'`

#### `management`
- Type: `TEXT`
- Constraint: None (nullable)
- Required: No
- Description: Clinical management guidance applicable at the class level. Describes monitoring,
  alternative therapies, or dosing adjustments. Displayed verbatim in API responses.

#### `sources`
- Type: `JSONB[]`
- Constraint: `NOT NULL DEFAULT '{}'`
- Required: At least one element must be present. CI validation rejects records with empty arrays.
- Description: An array of source citation objects. Each element describes one source that
  documents this class-level interaction rule.

  **Array element shape:**
  ```json
  {
    "name": "ONCHigh",
    "url": "https://www.healthit.gov/topic/onc-high-priority-drug-drug-interactions",
    "type": "clinical_guideline",
    "accessed_date": "2026-01-15"
  }
  ```

  | Field | Type | Description |
  |-------|------|-------------|
  | `name` | `string` | Human-readable name of the data source. |
  | `url` | `string` | Direct URL to the source document, dataset, or reference. |
  | `type` | `string` | Source classification. Must be one of: `clinical_guideline`, `fda_label`, `peer_reviewed_study`, `clinical_pharmacist_review`. |
  | `accessed_date` | `string` | ISO 8601 date (YYYY-MM-DD) when this source was retrieved or reviewed. |

---

## Table: `drug_interaction`

```sql
CREATE TABLE drug_interaction (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  drug1_rxcui     VARCHAR       NOT NULL REFERENCES drug_concept(rxcui),
  drug2_rxcui     VARCHAR       NOT NULL REFERENCES drug_concept(rxcui),
  severity        severity_enum NOT NULL,
  mechanism       TEXT,
  management      TEXT,
  sources         JSONB[]       NOT NULL DEFAULT '{}',
  class_rule_id   UUID          REFERENCES drug_class_interaction(id),
  is_generated    BOOLEAN       DEFAULT FALSE,
  confidence      NUMERIC(3,2),
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW(),

  CONSTRAINT drug_pair_unique UNIQUE (drug1_rxcui, drug2_rxcui)
);

CREATE UNIQUE INDEX drug_interaction_pair_idx
  ON drug_interaction (drug1_rxcui, drug2_rxcui);

CREATE INDEX drug_interaction_severity_idx
  ON drug_interaction (severity);

CREATE INDEX drug_interaction_class_rule_idx
  ON drug_interaction (class_rule_id);

CREATE INDEX drug_interaction_confidence_idx
  ON drug_interaction (confidence)
  WHERE confidence IS NOT NULL;
```

### Field Reference

#### `id`
- Type: `UUID`
- Constraint: `PRIMARY KEY`, auto-generated
- Required: Yes (auto-populated)
- Description: Internal surrogate key. Exposed in API responses as the interaction record ID
  to support stable references and auditing.

#### `drug1_rxcui`
- Type: `VARCHAR`
- Constraint: `NOT NULL REFERENCES drug_concept(rxcui)`
- Required: Yes
- Description: The RxCUI of the first drug in the interaction pair. Foreign key to
  `drug_concept.rxcui`. The constraint ensures no interaction can reference a drug that has not
  been registered in `drug_concept`. The pair ordering convention is: the drug with the
  lexicographically smaller RxCUI string is stored as `drug1_rxcui`. This normalization is
  enforced by the ingestion layer to prevent duplicate pairs in reverse order.

#### `drug2_rxcui`
- Type: `VARCHAR`
- Constraint: `NOT NULL REFERENCES drug_concept(rxcui)`
- Required: Yes
- Description: The RxCUI of the second drug in the interaction pair. Same constraints as
  `drug1_rxcui`. Always lexicographically greater than or equal to `drug1_rxcui` by convention.

#### `severity`
- Type: `severity_enum`
- Constraint: `NOT NULL`
- Required: Yes
- Description: The canonical severity of this specific drug pair interaction. For rows with
  `is_generated = TRUE`, this value is copied from the parent `drug_class_interaction.severity`
  at the time of generation. For direct pairs, this is set by the ingestion adapter.

#### `mechanism`
- Type: `TEXT`
- Constraint: None (nullable)
- Required: No
- Description: Pharmacological mechanism specific to this drug pair. For class-expanded rows,
  this is inherited from the parent class rule. For direct pairs, this is sourced from the
  originating dataset or community contribution. NLP-extracted mechanisms carry the same
  `confidence` score as the severity.

#### `management`
- Type: `TEXT`
- Constraint: None (nullable)
- Required: No
- Description: Clinical management guidance specific to this drug pair. Inherited from the class
  rule for generated rows. May be more specific than the class-level guidance for directly
  curated pairs.

#### `sources`
- Type: `JSONB[]`
- Constraint: `NOT NULL DEFAULT '{}'`
- Required: At least one element must be present for records with `is_generated = FALSE`.
  Generated rows inherit their sources from the parent `drug_class_interaction` row.
- Description: Source citations for this specific drug pair interaction. Same element shape as
  `drug_class_interaction.sources`. See that table's field reference for the full schema.

#### `class_rule_id`
- Type: `UUID`
- Constraint: `REFERENCES drug_class_interaction(id)` (nullable)
- Required: No
- Description: Foreign key to the `drug_class_interaction` row that generated this record.
  NULL for direct pair interactions (curated or NLP-extracted). Non-NULL for rows that were
  expanded from a class rule. The combination of `class_rule_id IS NOT NULL` and
  `is_generated = TRUE` identifies all class-derived records. Either condition alone is
  sufficient to identify generated records, but both are stored for query clarity.

#### `is_generated`
- Type: `BOOLEAN`
- Constraint: `DEFAULT FALSE`
- Required: No
- Description: TRUE if this row was created by the class-expansion engine from a
  `drug_class_interaction` rule. FALSE for directly ingested or NLP-extracted pairs. This flag
  allows the API to annotate returned interactions with their provenance type and allows
  maintainers to bulk-delete or regenerate class-derived pairs after a class rule changes.

#### `confidence`
- Type: `NUMERIC(3,2)`
- Constraint: None (nullable); valid range 0.00 to 1.00
- Required: No
- Description: Confidence score assigned by the OpenFDA NLP extraction pipeline. NULL for
  curated records (ONCHigh, NDF-RT, community PRs that passed clinical review). A NULL value
  is a positive assertion that confidence scoring is not applicable, not a missing value.
  Scores below 0.75 are not served in production API responses; those records are placed in a
  review queue. The partial index on `confidence WHERE confidence IS NOT NULL` supports
  efficient queries over NLP-extracted pairs without scanning curated records.

#### `created_at`
- Type: `TIMESTAMPTZ`
- Constraint: `DEFAULT NOW()`
- Required: No (auto-populated)
- Description: Timestamp of record creation in UTC. Used for dataset versioning, changelog
  generation, and the `dataset_version` field in API response metadata.

#### `updated_at`
- Type: `TIMESTAMPTZ`
- Constraint: `DEFAULT NOW()`
- Required: No (auto-populated on creation; must be explicitly updated on modification)
- Description: Timestamp of the most recent update to this record. Must be set to `NOW()` by
  any UPDATE statement that modifies clinical content (severity, mechanism, management, sources).
  Not automatically updated by a trigger in the base schema; the application layer is responsible.

#### `CONSTRAINT drug_pair_unique`
- Type: Unique constraint on `(drug1_rxcui, drug2_rxcui)`
- Description: Enforces that no two rows describe the same drug pair. The ingestion layer
  normalizes pair ordering (smaller RxCUI first) before INSERT. This constraint prevents
  both exact duplicates and reverse-order duplicates from entering the table.

---

## Index Summary

| Table | Index Name | Columns | Type | Purpose |
|-------|-----------|---------|------|---------|
| `drug_concept` | `drug_concept_rxcui_idx` | `rxcui` | B-tree unique | Fast drug lookup by RxCUI |
| `drug_concept` | `drug_concept_drug_class_gin_idx` | `drug_class` | GIN | Array containment queries for class expansion |
| `drug_concept` | `drug_concept_identifiers_gin_idx` | `identifiers` | GIN | JSONB containment queries for NDC/ATC/brand name resolution |
| `drug_class_interaction` | `drug_class_interaction_pair_idx` | `(class_a, class_b)` | B-tree unique | Class rule lookup and deduplication |
| `drug_interaction` | `drug_interaction_pair_idx` | `(drug1_rxcui, drug2_rxcui)` | B-tree unique | Primary interaction pair lookup (hot path) |
| `drug_interaction` | `drug_interaction_severity_idx` | `severity` | B-tree | Severity-filtered queries (e.g., contraindicated only) |
| `drug_interaction` | `drug_interaction_class_rule_idx` | `class_rule_id` | B-tree | Finding all interactions generated from a class rule |
| `drug_interaction` | `drug_interaction_confidence_idx` | `confidence` WHERE NOT NULL | Partial B-tree | Querying NLP-extracted pairs by confidence threshold |
