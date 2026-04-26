# ADR-004: OpenFDA Interaction Extraction via Natural.js + Regex, Gated by a Review Queue

**Date:** 2026-04-21
**Status:** Accepted
**Deciders:** Project maintainer

## Context

[ADR-003](adr-003-ndf-rt-pivot.md) removed NDF-RT from the roadmap and concentrated the breadth story for v0.3 on OpenFDA NLP extraction. OpenFDA drug labels are the only remaining public-domain, commercially-redistributable source that can realistically push the dataset past the 5,000-pair v1.0 target. Everything else in that size range is either CC BY-NC (DrugBank, SIDER, DDInter) or proprietary.

The integration design in [`docs/api/openfda.md`](../api/openfda.md) specifies *what* the pipeline does (bulk download, checksum verification, `drug_interactions` field, sentence tokenization, pattern matching, confidence scoring, review queue) but does not commit to *how* the NLP surface is implemented. The tech-stack table in `docs/project.md` names Natural.js + regex, but that choice was never formally recorded — and it is the single decision that most affects v0.3 precision, cost structure, maintenance burden, and reviewer workload.

Before we write the first extractor, the approach needs to be pinned down so that the extractor tests, the confidence-scoring function, and the review-queue schema are all built against the same contract.

The forces at play:

- **Precision over recall.** Non-Negotiable Rule #6 forbids serving pairs with `confidence < 0.75`. Any extractor whose mean confidence sits near that threshold produces a huge review queue with very little served output. We need an approach whose high-confidence output is *usable* at scale, not just high-recall with a wide low-quality tail.
- **No recurring API cost.** melorx is free to self-host. Any extractor that requires a paid LLM endpoint in the ingestion path creates an operating cost that forks the project into "hosted" and "self-hosted-but-broken" deployments. The CI ingestion job must be runnable on a GitHub Actions standard runner with zero external credentials beyond the OpenFDA public index.
- **Language boundary.** The stack is TypeScript end-to-end. Introducing a Python NLP microservice doubles the deploy surface (two containers, two dependency trees, two CI jobs) and creates an inter-process call on the ingestion hot path.
- **Review queue throughput is bounded by humans.** The project has no paid clinical reviewers. Community pharmacists contribute occasionally. Any extractor that floods the queue with ambiguous low-confidence matches stalls v0.3 at "200,000 pairs waiting for review" forever. The gating design must push the extractor toward *high-precision emit or no emit*, not toward "emit everything and sort it out later".
- **Determinism for CI.** The confidence scores drive the threshold check. A non-deterministic extractor (temperature-sampled LLM) makes regression tests impossible — the same label would produce different pairs across runs, and the `confidence >= 0.75` gate would produce different dataset sizes on identical inputs.

## Decision

The OpenFDA interaction extractor is implemented in TypeScript, in-process with the rest of the ingestion pipeline, using the following stack:

1. **Sentence tokenization** — Natural.js `SentenceTokenizer` splits each `drug_interactions` field value into sentences.
2. **Pattern matching** — a curated set of regex patterns, authored and version-controlled in `pipeline/sources/openfda/patterns.ts`, matches interaction statements and captures the object-drug surface form.
3. **Identifier resolution** — matched drug surface forms are resolved to RxCUI by the existing `pipeline/resolver/` service. The subject drug is the RxCUI already on the label's `openfda.rxcui` field.
4. **Confidence scoring** — a deterministic scoring function combines three additive signals, documented in `docs/api/openfda.md:119-125`: pattern specificity, signal density (multi-sentence reinforcement for the same pair within the label), and resolver match quality (exact vs approximate).
5. **Gated write** — the extractor writes every candidate pair to a staging table (`drug_interaction_review`). A promotion job moves pairs with `confidence >= 0.75` *and* two exact-match RxCUI resolutions into `drug_interaction` with the confidence score preserved. Every other pair stays in the review queue until a reviewer approves or rejects it.
6. **No LLM calls anywhere in the ingestion path.** This is a hard rule, not a preference. An optional `pipeline/sources/openfda/suggest/` tool may use an LLM to *propose new regex patterns to the maintainer during development*, but it never writes to the database and is not invoked during scheduled ingestion runs.

Severity, mechanism, and management fields on NLP-extracted pairs are populated from the label sentence itself (mechanism ≈ captured predicate, management ≈ null unless the sentence contains an explicit recommendation). Severity is inferred from a small keyword map (`contraindicated`, `should not be`, `avoid` → `contraindicated`; `may increase`, `monitor` → `monitor`; etc.), with any unmappable sentence defaulting to `moderate` and held in the review queue.

## Rationale

**Natural.js + regex is the only approach that satisfies all four constraints: TypeScript-native, deterministic, zero recurring cost, and high-precision on FDA label sentence structures.** FDA `drug_interactions` sections are written by regulatory affairs staff against a predictable rhetorical template — "concomitant use of X with Y may Z", "co-administration of X and Y has been shown to …", "X should not be used with Y". A tight regex set captures the high-precision portion of this grammar with room to reject low-confidence matches explicitly.

**Alternatives considered:**

*LLM extraction (Claude, GPT-4, local Llama).* Rejected for three reasons. First, non-determinism — the same label produces different pairs across runs, breaking regression tests and making the `confidence >= 0.75` gate produce different dataset sizes on identical inputs. Second, cost structure — extracting against 180,000+ labels on a monthly cadence at commercial LLM prices is a recurring operating bill that forks self-hosted and hosted deployments; local models erase the cost but re-introduce the language-boundary problem. Third, hallucination risk — an LLM can plausibly invent a drug name not present in the label text; the regex approach can only emit surface forms actually captured from the source sentence, so hallucination is architecturally impossible. The optional LLM-assisted pattern-suggestion tool in the decision preserves the upside of LLMs (fast pattern discovery during development) without letting them touch production data.

*spaCy (Python) in a sidecar service.* Rejected for the language-boundary cost. spaCy's biomedical models (`en_ner_bc5cdr_md`, `scispaCy`) are genuinely better than regex at entity recognition in biomedical text, but invoking them requires either a Python HTTP service or shelling out to a Python subprocess per label. The former doubles the deploy surface; the latter adds ~80ms per label × 180,000 labels = ~4 hours of process-spawn overhead per ingestion run, on top of the model inference itself. The extra precision does not justify the operational cost at this scale.

*Third-party TypeScript NLP library (compromise.js, wink-nlp).* Considered as an alternative to Natural.js. compromise.js has a richer grammar layer; wink-nlp has better entity-tagger ergonomics. Both fail on the same axis: they are not materially more precise than regex on the narrow grammatical band that FDA labels actually use, and they introduce a dependency whose upgrade path has historically been erratic. Natural.js is used only for sentence tokenization, which it does reliably; the interaction-pattern layer is ours.

*Pre-trained DDI extraction models (DDIMDL, BERT-DDI).* Rejected as research-ware. These models are trained on DrugBank (CC BY-NC) and published under licenses that do not permit commercial redistribution of extracted facts. Using them to derive public-domain-label interactions would create a license-provenance ambiguity that is not worth defending.

*No NLP, only curated pairs.* Rejected. ADR-003 committed the project to OpenFDA as the breadth source; without NLP the v1.0 pair target is unreachable within the stated timeline.

## Consequences

**Positive:**
- The extractor is deterministic. Given the same input label and pattern set, it produces the same pairs with the same confidence scores every run. Regression tests are meaningful.
- The extractor is TypeScript-native, runs in the same process as the resolver, and shares the `DATABASE_URL` connection pool. No sidecar, no inter-service serialization.
- Hallucination is architecturally impossible — the extractor can only emit surface forms present in the source sentence.
- Pattern corpus evolution is a pull request: a reviewer can see exactly which new regex was added, why, and against which label sentences it triggered. This is the kind of change that community clinicians can meaningfully review, unlike a model weight update.
- The CI ingestion job needs no secrets beyond the OpenFDA public index. Any contributor can run it locally against the same `download.json` the scheduled job uses.

**Negative:**
- Precision-first extraction means recall is lower than a well-tuned NLP model would achieve. Real interactions phrased in unusual grammar will be missed on the first pass and have to be picked up by pattern corpus extensions over time. The v0.3 dataset size will lag the theoretical ceiling.
- Pattern authoring is ongoing work. Every quarter or so, review queue triage will surface sentence grammars the patterns don't catch, and new patterns will need to be added. This is accepted maintenance, not a one-time cost.
- Class-referential sentences ("NSAIDs may reduce the antihypertensive effect of ACE inhibitors") cannot be promoted to concrete pairs by the extractor. Per `docs/api/openfda.md:180`, these are logged but not promoted. Where possible, these sentences are matched against the existing `drug_class_interaction` rules and used as *confirmatory evidence* on an existing class rule, not as new records.

**Risks:**
- **Pattern overfitting.** If early patterns are authored against a small sample, they will capture the sample's idioms and miss the real grammar distribution. Mitigation: the first pattern set is authored against a stratified sample of labels (by approval decade and by therapeutic class), not just the top N by alphabet or by drug recognition.
- **Review queue starvation.** If too many pairs are held for review and no clinician-reviewer is available, the queue grows without limit and v0.3's breadth story stalls in staging. Mitigation: the promotion criteria (`confidence >= 0.75` AND two exact-match resolutions) are tight enough that a meaningful fraction of output auto-promotes; the review queue is specifically for the ambiguous middle, not the whole output. If the queue still grows unbounded, the answer is to tighten the patterns further, not loosen the gate.
- **Confidence-score drift.** If the scoring function is tuned aggressively to push more pairs across the 0.75 threshold, the gate loses its meaning. Mitigation: the scoring function is a pure function of three named signals, captured in code, and covered by golden-file tests. Changes to the function require an ADR update, not a silent tweak.

## Compliance Notes

**No license impact.** OpenFDA data is U.S. government work in the public domain (17 U.S.C. § 105). The regex patterns and scoring function are authored by the project and licensed Apache 2.0. Natural.js is MIT. No CC BY-NC, proprietary, or research-only training data is involved in this pipeline.

**Non-Negotiable Rule #6 is enforced architecturally.** The promotion job is the only writer to `drug_interaction` for NLP-sourced pairs, and its criteria include the `confidence >= 0.75` check. The API query engine additionally enforces the check at read time, so even if a bypass were attempted at write time, the gate would still hold at serve time.

**Non-Negotiable Rule #4 is enforced by construction.** Every extracted pair carries at least one `sources[]` entry pointing to the originating OpenFDA label — the `set_id`, the label's `effective_time`, and the `drug_interactions` sentence index are all recorded on the record.

**No clinical-decision-system framing.** NLP-extracted pairs inherit the non-suppressible disclaimer on every `/v1/interactions*` response. The `confidence` field is additionally surfaced in the API response so downstream applications can apply their own risk tolerance on top of the 0.75 gate. Nothing in this pipeline shifts melorx's positioning from "informational reference tool" toward "clinical decision system".
