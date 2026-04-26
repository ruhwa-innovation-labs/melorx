# Data Layer — Design Rationale

> **Document type:** Architecture decision record
> **Scope:** Database engine selection, schema design, ingestion strategy, and data governance rules
> **Audience:** Contributors, clinical systems integrators, and maintainers

---

## Why PostgreSQL 16

PostgreSQL was selected over every alternative considered (SQLite, MongoDB, PlanetScale) because
no other engine satisfies all three of the following requirements simultaneously within a single
runtime.

### JSONB for dynamic source arrays

Every interaction record in `drug_interaction` and `drug_class_interaction` carries a `sources`
column typed as `JSONB[]` — an array of JSON objects describing the citation provenance of that
record. The shape of each source object (`name`, `url`, `type`, `accessed_date`) is stable
within a source family but may evolve as new ingestion adapters are added. JSONB handles this
without schema migrations on the interaction tables themselves. GIN indexing on JSONB columns
also allows efficient containment queries — for example, finding all interactions sourced from a
specific data provider without a full table scan.

The `drug_concept.identifiers` column presents a similar case: a drug may have one NDC or many,
may or may not have an ATC code, and may be known by a variable number of brand names. Modeling
each identifier type as a separate nullable column would produce a sparse, wide table and require
a migration every time a new identifier system is added. JSONB with a documented shape contract
is the correct tradeoff here.

### Row-Level Security for multi-tenant isolation

The hosted demo deployment operates as a single database instance serving multiple API tenants
with rate-limited access. PostgreSQL's Row-Level Security (RLS) policies enforce data isolation
at the database layer, independent of application-layer logic. This is not a v0.1 requirement
but the schema is designed to accommodate RLS policies without restructuring — a `tenant_id`
column can be added and RLS policies applied without changing the interaction query logic.

SQLite has no RLS. MongoDB's approach to field-level security is more complex and less
composable with the relational guarantees the class-inheritance pattern requires.

### pgvector for future semantic search

A planned post-v1.0 capability is embedding-based semantic search: given a drug name in a
non-canonical form (a brand name variant, a misspelling, a foreign-language name), resolve it
to the correct `drug_concept` record using vector similarity rather than exact string matching.
The `pgvector` PostgreSQL extension adds a native `vector` column type and approximate nearest-
neighbor index (HNSW, IVFFlat) directly inside the same database. This means the resolver
service can issue a single SQL query that combines relational filtering with semantic similarity
scoring — without introducing a separate vector database, a separate service boundary, or an
additional infrastructure dependency.

The engine selection bets that keeping all data operations inside PostgreSQL — relational
integrity, JSONB flexibility, RLS, and future vector search — is worth more than any
feature-specific advantage offered by a specialized store.

---

## The Three-Table Core Model

The schema is deliberately minimal. Three tables cover the full domain.

### `drug_concept`

Stores the canonical representation of a drug. The `rxcui` (RxNorm Concept Unique Identifier)
is the system's canonical identifier — all interaction lookups are keyed on this column. The
`drug_class` column is a `VARCHAR[]` array because a drug can belong to more than one class
simultaneously (ibuprofen is both an NSAID and a COX-1/COX-2 inhibitor). The `identifiers`
JSONB column holds all secondary lookup keys: NDC numbers, ATC codes, DrugBank IDs, and brand
names. This design means a query arriving with an NDC or a brand name is resolved to an RxCUI
by the Resolver Service before it ever touches the interaction tables — the interaction tables
see only canonical identifiers.

### `drug_class_interaction`

Stores pharmacological rules at the class level. A single row such as
`(class_a: 'NSAID', class_b: 'ACE inhibitor', severity: 'moderate')` encodes a rule that
applies to every drug pair where one drug belongs to class `NSAID` and the other to class
`ACE inhibitor`. This table is the source of truth for class-level knowledge. It does not
contain concrete drug RxCUI references — only class name strings.

### `drug_interaction`

Stores concrete drug pair interactions. A row here represents a known interaction between two
specific drugs identified by their RxCUI values. A row in this table may originate in three ways:

1. **Direct ingestion** — the interaction was explicitly documented for this specific drug pair
   (e.g., warfarin + fluconazole from ONCHigh). `class_rule_id` is NULL, `is_generated` is FALSE.
2. **Class expansion** — the interaction was generated at query time by expanding a class rule
   and then materialized for caching. `class_rule_id` references the originating
   `drug_class_interaction` row, `is_generated` is TRUE.
3. **NLP extraction** — the interaction was extracted from an OpenFDA drug label by the NLP
   pipeline. `confidence` carries a score between 0.0 and 1.0; pairs below 0.75 are held for
   human review before serving in production.

---

## The Class-Inheritance Pattern: Query-Time Expansion, Not Pre-Materialization

The `drug_class_interaction` table stores rules. It does not pre-compute the cross-product of
all drugs that belong to both sides of a class rule. This is a deliberate architectural choice.

Pre-materializing class expansions would mean: for every class rule, find all drugs in class A,
find all drugs in class B, write a `drug_interaction` row for every pair. With a modest dataset
of 500 drugs and 50 class rules, this could produce tens of thousands of rows where the
underlying evidence is a single class-level rule. Problems with pre-materialization:

- **Stale data on dataset updates.** Adding a new drug to a class would require re-running the
  expansion job to generate new pair rows. If the job fails silently, the new drug has no class-
  derived interactions.
- **Combinatorial explosion at scale.** Drug classes with many members (e.g., SSRIs,
  fluoroquinolones) would generate O(n²) rows per class-pair rule. The `drug_interaction` table
  would grow to millions of rows, the overwhelming majority of which are lower-confidence
  class-derived entries that crowd the query planner's statistics.
- **Ambiguous provenance.** A pre-materialized row looks identical to a directly curated row.
  Distinguishing class-derived interactions from pair-specific evidence requires an additional
  flag or join — which the `class_rule_id` and `is_generated` columns already provide when
  rows are generated on demand.

The query engine instead expands class rules at query time: when a request arrives for drug pair
(A, B), it checks for a direct `drug_interaction` row first, then joins `drug_concept.drug_class`
against `drug_class_interaction` to find applicable class rules. The result set merges both
direct and class-derived interactions, with the response clearly distinguishing them via
`is_generated` and `class_rule_id`.

When scale demands it (see: Scalability Path in `project.md`), the expansion results can be
cached in materialized views or an LRU Redis cache without changing the canonical schema.

---

## Confidence Scoring Rationale

The `drug_interaction.confidence` column is `NUMERIC(3,2)` and is explicitly nullable.

- **NULL** means the interaction was curated — it was sourced from a clinician-reviewed dataset
  (ONCHigh concrete pairs, class-rule expansions, or a community PR that passed clinical review). A NULL
  confidence value is not a missing value; it is a positive assertion that this record does not
  require a confidence score because its provenance is direct curation.

- **0.0 – 1.0** means the interaction was extracted by the OpenFDA NLP pipeline. The score
  reflects the pipeline's estimate of extraction accuracy, derived from sentence-pattern match
  quality and corroboration across multiple label sections. A score of 0.75 is the production
  serving threshold: pairs below this value are placed in a review queue and not returned by the
  API until a maintainer or clinical reviewer promotes them.

This design avoids a common mistake in ML-augmented datasets: conflating "not yet scored" with
"low confidence." Curated pairs carry no score to signal that scoring is not applicable, not
that they are uncertain.

---

## The Canonical Severity Enum

Severity is stored as a PostgreSQL enum (`severity_enum`) rather than a VARCHAR. This is
enforced at the database layer, not only in application code, for two reasons:

1. **Constraint at the write layer.** No ingestion adapter, migration script, or raw INSERT
   can introduce a non-canonical severity value. The database rejects it before it reaches
   any application validation.
2. **Stable query predicates.** Downstream queries filtering on severity (e.g., "return only
   contraindicated and serious interactions") use enum comparisons, which are index-friendly and
   unambiguous. Free-text severity values would require LOWER() normalization, LIKE matching,
   and case-by-case handling of source-specific synonyms at query time.

All ingestion adapters are responsible for mapping their source-specific severity vocabulary to
the canonical enum before insertion. The severity mapping table in `project.md` documents the
current mappings; new source adapters must extend it.

---

## Data Source Ingestion Order and Rationale

Ingestion is phased by data quality and license certainty:

### Phase 1 — ONCHigh (v0.1)

ONCHigh is a clinician-curated list of 437 high-priority drug-drug interactions published by the
Office of the National Coordinator for Health Information Technology (ONC). It is public domain,
maintained by clinical pharmacists, and covers the interactions most likely to cause serious
adverse events. It is the correct seed dataset because it is small enough to validate the full
pipeline end-to-end while being clinically significant enough to make the API useful on day one.
Every ONCHigh pair arrives with a severity already mapped to the canonical enum; no NLP is
required.

### Phase 2 — ONCHigh Class-Rule Expansion (v0.2)

Originally planned as NDF-RT ingestion (~3,000 pairs). Removed per [ADR-003](../plans/adr-003-ndf-rt-pivot.md): NDF-RT is absent from the current RxNorm release (NLM deprecated it in 2018 and shut the RxNav interaction API in January 2024); no authoritative, currently-licensed source remains to ingest.

The v0.2 broadening comes instead from expanding the 14 accepted ONCHigh class-level rules (Phansalkar 2012) at query time. Each rule encodes a class × class interaction (e.g., *statins × CYP3A4 inhibitors* → contraindicated, *SSRIs × MAOIs* → contraindicated) and resolves to concrete drug-pair hits via `drug_concept.drug_class[]` at query time — never pre-materialised. This produces hundreds of concrete pair hits across the most clinically significant mechanisms without a separate ingestion source.

Identifier enrichment in v0.2 populates `drug_concept.identifiers` with ATC codes, brand names, and NDCs sourced from RxNorm (RXNCONSO, RXNREL, RXNSAT). This enables the resolver to map any of those identifier types to a canonical RxCUI at query time.

### Phase 3 — OpenFDA Drug Labels (v0.3)

FDA-approved drug labels contain drug interaction sections in structured but narrative text.
OpenFDA provides bulk downloads of ~10,000+ labels under a public domain license. The NLP
pipeline extracts interaction pairs from the interaction section text using Natural.js and
regex heuristics tuned to FDA label sentence patterns. All extracted pairs receive a confidence
score; none are served in production below 0.75 without manual review. This phase provides the
"long tail" — interactions for less-common drugs and drug combinations not covered by the
curated sources.

### Ongoing — Community PRs

Community-contributed interactions are ingested in Apache 2.0 format via the JSON contribution
template. Each contribution must include a `sources[]` array with at least one citation of type
`clinical_guideline`, `fda_label`, `peer_reviewed_study`, or `clinical_pharmacist_review`. CI
validates the schema and checks for duplicate pairs. A maintainer or designated clinical reviewer
must approve before merge.

---

## The Hard License Rule

No data from CC BY-NC, CC BY-NC-SA, research-only, or any non-commercial license may be
ingested into the main dataset. This is not a preference — it is a hard architectural constraint.

The melorx dataset is licensed Apache 2.0 to ensure that any developer, including those at
commercial healthcare companies, can redistribute it in their products without triggering a
license violation. Mixing a single CC BY-NC source into the dataset would legally contaminate
the entire dataset's redistribution terms, destroying the project's primary value proposition
for the Clinical Systems Integrator and Healthcare Startup personas.

The specific sources that must never be ingested are: SIDER 4.1 (CC BY-NC), DrugBank (CC BY-NC
for the bulk dataset), and DDInter (research-only). These exclusions are documented in
`project.md` and enforced as a CI policy on all ingestion adapter PRs.
