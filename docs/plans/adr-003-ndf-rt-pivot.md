# ADR-003: Drop NDF-RT Ingestion in Favour of ONCHigh Class Expansion + OpenFDA

**Date:** 2026-04-19
**Status:** Accepted
**Deciders:** Project maintainer

## Context

The v0.1 foundation plan and the `docs/project.md` data-source priority table both name the VA's National Drug File Reference Terminology (NDF-RT) as the v0.2 broadening source — expected to add ~3,000 moderate-severity interaction pairs on top of ONCHigh's curated high-priority set.

During v0.2 implementation an audit of the April 2026 RxNorm full monthly release found:

- Zero rows in `RXNCONSO.RRF` with `SAB = NDFRT`.
- Zero rows in `RXNREL.RRF` with `SAB = NDFRT`.
- Zero `RELA` values containing any interaction verb (`may_interact_with`, `interacts_with`, or similar) across any source vocabulary.

The SAB vocabularies present in the April 2026 release are `ATC`, `CVX`, `DRUGBANK`, `GS`, `MMSL`, `MMX`, `MTHCMSFRF`, `MTHSPL`, `NDDF`, `RXNORM`, `SNOMEDCT_US`, `USP`, and `VANDF` — all structural. NDF-RT is entirely absent.

This tracks with NLM's public timeline: NDF-RT was deprecated in 2018 and its data was progressively removed from the RxNorm release cycle. The RxNav interaction API, which surfaced the NDF-RT `may_interact_with` pairs, was decommissioned on **January 2, 2024** — the same event that created the infrastructure gap that motivates melorx in the first place.

Obtaining NDF-RT data from archived NLM sources is possible in theory, but:

- No archive is maintained as an authoritative, versioned, currently licensed source.
- Any discovered dump would be at least two years stale on drug coverage.
- The original NDF-RT `may_interact_with` relationship carried no severity, mechanism, or management text — it was a flat pair list. Reconstructing those fields would require the same clinical review effort as curating new pairs from scratch.

The v0.2 plan item "NDF-RT VA ingestion adapter" is therefore infeasible as written.

## Decision

**Remove NDF-RT from the planned data sources.** The breadth gap it was intended to fill is split across two other mechanisms, both already in motion:

1. **ONCHigh class-rule expansion** (v0.2, shipped in commits `2fc95f6` and `9b9b886`). The 14 accepted ONCHigh class rules expand at query time via `drug_class_interaction` and `drug_concept.drug_class`, covering hundreds of concrete pairs across SSRIs × MAOIs, statins × CYP3A4 inhibitors, triptans × MAOIs, and similar high-leverage categories. This delivers breadth without a separate ingestion source.

2. **OpenFDA NLP extraction** (v0.3, already planned). OpenFDA drug labels carry narrative interaction sections that an NLP pipeline can extract into confidence-scored pairs. This was always planned as the long-tail coverage mechanism; it now absorbs the "broader moderate-severity pairs" role that NDF-RT was intended to play.

## Rationale

**There is no authoritative current NDF-RT source to ingest.** The ingestion adapter was specified against a dataset that the upstream publisher has removed. No replacement dataset has been named by NLM, and the January 2024 API shutdown is what the project exists to replace.

**Class-rule expansion already produces the expected coverage pattern.** NDF-RT's `may_interact_with` pairs were largely derived from the same drug-class mechanism relationships that ONCHigh encodes directly (CYP3A4 inhibition × simvastatin, serotonergic drugs × MAOIs, ergot alkaloids × CYP3A4 inhibitors, etc.). Expressing these as class rules is more compact, more maintainable, and easier to audit than importing the expanded pairs.

**Alternatives considered:**

*Ingest an archived NDF-RT dump.* Rejected: no authoritative currently-licensed archive exists; any dump discovered would be stale by 24+ months on drug coverage, would need its severity/mechanism/management fields backfilled by hand, and would create an implicit contract to maintain data that has no upstream producer.

*Use DrugBank's DDI dataset as a substitute.* Rejected for licensing: DrugBank's DDI data is CC BY-NC. Ingesting it violates Non-Negotiable Rule #3 in `CLAUDE.md` and would infect the Apache 2.0 dataset license.

*Ingest ONCHigh's 1,150-pair expansion from dbmi-pitt/public-PDDI-analysis.* Rejected: the repo has no license. Facts are not copyrightable, but a compilation can carry thin copyright, and relying on an unlicensed redistribution is fragile. The class rules transcribed directly from the peer-reviewed Phansalkar 2012 paper already cover the same ground.

## Consequences

**Positive:**
- Removes a blocked roadmap item that would have generated cycles without producing a working adapter.
- Breaks the implicit dependency on a deprecated upstream publisher.
- Keeps v0.2 scope tight around ONCHigh class expansion and the NDC / brand resolver, both of which have clear paths to completion.
- The "5,000+ pairs" v1.0 success metric remains achievable — it is now counted as concrete pairs + class-rule expansions + OpenFDA-extracted pairs, with a footnote in `docs/project.md` explaining the breakdown.

**Negative:**
- The v0.2 dataset is narrower than originally promised. Most of the breadth now hinges on OpenFDA NLP quality in v0.3.
- Callers looking for a specific moderate-severity pair not covered by any ONCHigh class rule will get an empty `interactions[]` until v0.3 ships.

**Risks:**
- If OpenFDA NLP extraction underperforms expectations in v0.3, the project's coverage stays below the 5,000-pair target for longer than planned. Mitigation: the confidence-scoring and review-queue design from `docs/api/openfda.md` is already specified to keep low-confidence pairs out of the API surface, which means under-performance degrades breadth rather than quality.

## Compliance Notes

No license impact. Removing a source is license-safe by construction. The decision actively avoids the DrugBank CC BY-NC trap.

No disclaimer or clinical-reference-positioning impact. Coverage narrowing is factual and does not change how the API frames its data (informational reference tool, non-suppressible disclaimer).
