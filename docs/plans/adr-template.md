# ADR-[NUMBER]: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXX
**Deciders:** [names or roles]

## Context

[What is the situation that prompted this decision? What forces are at play?]

## Decision

[What was decided?]

## Rationale

[Why this option over alternatives? List alternatives considered.]

## Consequences

**Positive:** [What becomes easier or better?]
**Negative:** [What becomes harder or is accepted as a trade-off?]
**Risks:** [What could go wrong?]

## Compliance Notes

[Any impact on Apache 2.0 license boundaries, clinical disclaimer requirements, or data
licensing rules?]

---

---

# ADR-001: Use RxCUI as Canonical Drug Identifier

**Date:** 2026-04-14
**Status:** Accepted
**Deciders:** Project maintainer

## Context

The interaction database needs a single canonical identifier to represent drug concepts
internally. Drug information exists across multiple identifier systems in active use: RxNorm
Concept Unique Identifiers (RxCUI), National Drug Codes (NDC), Anatomical Therapeutic
Chemical (ATC) codes, and brand names. Each system has different properties, coverage, and
institutional backing.

The canonical identifier is the primary key on `drug_concept` and the foreign key in
`drug_interaction`. Every drug lookup, every interaction record, and every query result
pivots on this identifier. Changing the canonical identifier after data is seeded is a
significant migration; the choice must be made before v0.1.

## Decision

Use RxCUI (RxNorm Concept Unique Identifier) as the canonical drug identifier in the
`drug_concept` table and throughout the interaction schema.

All other identifiers (NDC, ATC, brand name) are stored in the `identifiers` JSONB column
on `drug_concept` and are supported as input to the resolver service, which normalizes them
to RxCUI before any database query.

## Rationale

**RxCUI is the US standard for drug identification in clinical information systems.** RxNorm
is maintained by the National Library of Medicine and is the identifier system used by the
FDA, major EHR vendors (Epic, Cerner), CMS, and the VA. The ONCHigh dataset — the v0.1
seed data — uses RxCUI natively. NDF-RT (VA) also uses RxCUI. Using RxCUI requires no
translation for the two highest-quality data sources.

**Alternatives considered:**

*ATC codes.* ATC (Anatomical Therapeutic Chemical) is the WHO standard and is widely used in
European markets. However, ATC codes classify drug classes, not individual drug concepts. A
single ATC code maps to many concrete drugs; using ATC as the canonical identifier would
require disambiguating class-level codes for every concrete pair interaction. ATC is better
suited as a secondary identifier for class-level rules, which is how it is used.

*NDC.* NDC (National Drug Code) identifies specific drug products (manufacturer, dosage form,
package size), not drug concepts. A single drug concept (e.g., ibuprofen 200mg tablets) maps
to hundreds of NDC codes across manufacturers and package sizes. Using NDC as the canonical
identifier would create massive fan-out in the interaction table. NDC is kept as a lookup
key in the resolver but not as the canonical identifier.

## Consequences

**Positive:** The two primary seed data sources (ONCHigh, NDF-RT) require no identifier
translation during ingestion. RxCUI is recognized by downstream healthcare systems without
mapping. The NLM's RxNorm API provides a well-documented lookup service for resolving brand
names and NDCs to RxCUI.

**Negative:** RxCUI values can be retired or merged by the NLM when drug concepts are
updated. The resolver must handle deprecated CUI chains and version-pin RxNorm snapshots to
avoid silent identifier drift. International deployments will need to extend the resolver to
support ATC-primary lookup without exposing RxCUI internals to callers.

**Risks:** NLM could change the RxNorm release cadence or API availability. The project
caches RxNorm lookups locally to mitigate dependency on live NLM API availability.

## Compliance Notes

RxNorm data is produced by the NLM under a license that permits commercial use and
redistribution in derivative products. Storing RxCUI values in the database does not create
a license conflict with Apache 2.0. The actual RxNorm dataset files are not redistributed —
only the CUI values derived from them.

---

---

# ADR-002: Expand Drug Class Interactions at Query Time, Not Pre-Materialized

**Date:** 2026-04-14
**Status:** Accepted
**Deciders:** Project maintainer

## Context

The schema includes a `drug_class_interaction` table for class-level interaction rules (e.g.,
"all NSAIDs interact with all ACE inhibitors at moderate severity"). When a user queries for
an interaction between ibuprofen and lisinopril, the query engine must determine whether a
class-level rule applies and, if so, return it as a concrete interaction.

There are two approaches: expand class rules into concrete pairs at ingestion time
(pre-materialization), or expand them dynamically at query time. The decision affects database
size, query complexity, data freshness, and maintenance burden.

## Decision

Expand drug class interactions at query time. Class rules are stored in
`drug_class_interaction`. The query engine joins `drug_concept.drug_class` against class rules
at query time to find applicable interactions. No pre-materialized concrete pairs are generated
from class rules.

A concrete pair row in `drug_interaction` with `is_generated = TRUE` and a non-null
`class_rule_id` is only written when a class-rule-derived interaction is explicitly requested
and cached for performance. Pre-population of all possible concrete pairs is not performed.

## Rationale

**Pre-materialization creates a stale combinatorial explosion.** If a class rule covers 200
NSAIDs and 150 ACE inhibitors, materializing it creates 30,000 rows. When a new NSAID is
added to `drug_concept`, those 30,000 rows must be regenerated or supplemented. When a class
rule is corrected (e.g., severity updated), all 30,000 rows must be updated. The maintenance
surface is proportional to the product of class sizes, which grows quadratically as the
dataset expands.

**Query-time expansion is simpler to maintain.** A severity correction to a class rule takes
effect immediately on the next query, without a migration or reprocessing step. A new drug
added to `drug_concept` with the correct `drug_class[]` array automatically participates in
all applicable class rules on its first query.

**Query-time expansion is fast enough.** A class expansion join on an indexed `drug_class`
array column with a small number of class rules (~50–200 at v1.0 scale) is a sub-millisecond
operation. It does not require pre-materialization to meet the p99 < 20ms target.

**Alternatives considered:**

*Full pre-materialization.* Generate all concrete pairs from all class rules at ingestion time
and store them with `is_generated = TRUE`. Rejected because of the maintenance and correctness
problems described above.

*Hybrid: pre-materialize on write, invalidate on rule change.* Pre-generate pairs when a new
drug is added, invalidate when a class rule changes. More complex than query-time expansion
with no performance advantage at current scale. Deferred as a possible optimization if
materialized views become necessary at 10x dataset size.

## Consequences

**Positive:** Class rule corrections are instantaneous. Adding new drugs to existing classes
requires no secondary processing. The `drug_interaction` table stays smaller and more
manageable. The query logic is centralized in the query engine, not spread across an
ingestion process.

**Negative:** Query-time expansion adds a join that pure pair lookups do not need. This join
must be covered by appropriate indexes on `drug_concept.drug_class` (GIN index on the array
column). At 10x dataset size, this decision may need to be revisited in favor of materialized
views.

**Risks:** If drug class assignments on `drug_concept` are incorrect or incomplete, users will
not see applicable class-level interactions. The correctness of the resolver's class assignment
logic is a critical dependency. Class assignment errors are silent (no interaction returned
rather than an error), which makes them harder to detect.

## Compliance Notes

No license or clinical disclaimer impact. The expansion strategy is an internal query
engine detail and does not affect the structure of API responses or the disclaimer
injection requirement.
