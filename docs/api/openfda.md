# OpenFDA Integration

## Purpose

OpenFDA drug label bulk downloads are used as the **long-tail data source** for drug-drug interaction (DDI) extraction in melo-rx (v0.3 of the ingestion pipeline). Where ONCHigh and NDF-RT provide curated, structured interaction records covering the most clinically significant pairs, OpenFDA labels expand coverage to the broader set of commercially available drugs — at the cost of requiring NLP extraction from unstructured narrative text.

The integration is one-directional: melo-rx downloads FDA drug label data, extracts interaction pairs from the `drug_interactions` field, scores them by confidence, and promotes high-confidence pairs into the interaction database after a review gate.

---

## Bulk Download

### Entry point

```
GET https://api.fda.gov/download.json
```

This endpoint returns a JSON index of all available bulk export files. The relevant section is `drug.label`, which contains download records for the full FDA drug label dataset.

**Example index entry (excerpt)**

```json
{
  "results": {
    "drug": {
      "label": {
        "total_records": 180000,
        "export_date": "2026-04-01",
        "partitions": [
          {
            "display_name": "drug label 0001 of 0050",
            "records": 3600,
            "file": "https://download.open.fda.gov/drug/label/drug-label-0001-of-0050.json.zip",
            "size_mb": 28.4,
            "checksum": "sha256:a3f7bc..."
          }
        ]
      }
    }
  }
}
```

Each partition file is a ZIP archive containing a JSON array of drug label records.

### SHA-256 checksum verification

Every partition file must be verified against the `checksum` value published in the index before ingestion proceeds. The ingestion pipeline must:

1. Download the partition file.
2. Compute the SHA-256 hash of the downloaded ZIP.
3. Compare it against the `checksum` value from the index.
4. If the hashes do not match, discard the file, log an error with the expected and actual checksums, and skip that partition. Do not attempt to ingest a file that fails checksum verification.

This prevents ingestion of corrupted or tampered files. The FDA publishes checksums alongside every export; skipping verification is not acceptable.

---

## Label JSON Structure

Each record in a partition file is a drug label JSON object. The field relevant to DDI extraction is `drug_interactions`.

**Relevant fields**

| Field | Type | Description |
|-------|------|-------------|
| `openfda.rxcui` | string[] | RxCUI values associated with this label, when available |
| `openfda.brand_name` | string[] | Brand names for the drug |
| `openfda.generic_name` | string[] | Generic names for the drug |
| `drug_interactions` | string[] | Array of narrative text sections describing known drug interactions |

**Example `drug_interactions` value**

```json
{
  "drug_interactions": [
    "Warfarin: Concomitant use with ibuprofen has been associated with an increase in anticoagulant effect. Monitor INR closely. Aspirin: Co-administration with NSAIDs may increase the risk of gastrointestinal bleeding."
  ]
}
```

The `drug_interactions` field, when present, contains one or more strings of free-form narrative text. The text is written for human readers — formatting, terminology, and sentence structure vary significantly across manufacturers and label versions.

---

## NLP Extraction Approach

The OpenFDA pipeline extracts interaction pairs from `drug_interactions` text using a two-stage process: sentence tokenization followed by regex-based pattern matching.

### Stage 1: Sentence tokenization

The Natural.js `SentenceTokenizer` splits each `drug_interactions` block into individual sentences. Tokenization is applied per sentence rather than per label section to reduce the span of context each pattern must match.

### Stage 2: Pattern matching

A set of regex patterns matches sentences that describe interaction statements. Patterns are designed to identify:

- A **subject drug** (the drug covered by the label being processed)
- An **object drug** (the drug it interacts with, named in the sentence)
- An **effect or risk statement** (the interaction description)

Example patterns:

```
/concomitant use with (.+?) (has been|may|can|should)/i
/co-administration (of|with) (.+?) (increases?|decreases?|may increase|may decrease)/i
/(.+?) should not be used (concomitantly|together|with) (.+?)/i
```

When a sentence matches a pattern, the pipeline:

1. Extracts the named drug(s) from the match groups.
2. Attempts to resolve each drug name to an RxCUI via the Resolver Service (which uses the local cache or calls the NLM API as needed).
3. If both drugs resolve to valid RxCUIs, a candidate interaction pair is created.

### Confidence scoring

Each extracted pair receives a confidence score between `0.0` and `1.0`. The score is derived from:

- **Pattern match strength**: higher-specificity patterns (e.g. those that capture both drug name and a quantified effect) score higher than broad patterns.
- **Source signal density**: labels that reference the interaction in multiple sentences or contexts receive a higher score than single-mention matches.
- **RxCUI resolution quality**: pairs where both drugs resolved to exact name matches score higher than pairs where one drug was resolved via approximate matching.

The `confidence` field on `drug_interaction` records derived from this pipeline stores this score. Callers can observe it in API responses; `null` means the record was curated from a structured source and is not subject to confidence scoring.

---

## Confidence Threshold and Review Queue

Extracted pairs with `confidence < 0.75` are written to a **review queue** and are **not served via the API** until a maintainer or designated clinical reviewer manually approves them.

This threshold is intentional. FDA label `drug_interactions` text is unstructured and inconsistently formatted (see Known Limitations below). Serving low-confidence extractions without review would degrade the reliability of the dataset and undermine the trust that clinicians and clinical systems integrators place in melo-rx data.

The review queue is stored in the database as a separate staging table. Approved pairs are promoted to `drug_interaction` with their `confidence` score intact. Rejected pairs are discarded with a logged reason.

Pairs at or above `0.75` confidence are eligible for automatic promotion, but may still be held if the extracted drug names could not be resolved to valid RxCUIs with high certainty.

---

## License

OpenFDA data is produced by the U.S. Food and Drug Administration, a U.S. government agency. U.S. government works are not eligible for copyright protection under 17 U.S.C. § 105 and are in the **public domain**. OpenFDA data is explicitly safe to ingest, redistribute, and incorporate into the melo-rx dataset under the project's Apache 2.0 license.

This is one of the key reasons OpenFDA labels are used as the long-tail source rather than alternatives such as DrugBank (CC BY-NC) or SIDER (CC BY-NC), which would contaminate the dataset license.

---

## Update Cadence

The FDA publishes drug label updates continuously as manufacturers submit new or revised labeling. OpenFDA bulk export files are refreshed on an ongoing basis.

The ingestion pipeline must run **at minimum monthly** to keep the dataset current with newly approved drugs and revised interaction sections. The recommended mechanism is a **GitHub Actions cron job** scheduled on the first day of each month:

```yaml
on:
  schedule:
    - cron: "0 2 1 * *"   # 02:00 UTC on the 1st of each month
```

Each pipeline run:

1. Fetches the current `download.json` index.
2. Compares partition file checksums against the previously ingested run's checksums (stored in a pipeline state table).
3. Downloads and verifies only the partitions that have changed since the last run (incremental ingestion).
4. Processes new and updated labels through the NLP extraction pipeline.
5. Writes new candidate pairs to the review queue or promotes them if confidence is sufficient.
6. Updates `meta/stats` to reflect the new dataset state.

Full re-ingestion (re-processing all partitions from scratch) should be performed when the extraction regex patterns are updated, to ensure the full label corpus is evaluated against the latest patterns.

---

## Known Limitations

The `drug_interactions` field in FDA drug labels is unstructured narrative text written for clinicians, not machines. Operators and API consumers should be aware of the following limitations, which directly affect the reliability of NLP-extracted interaction pairs:

**Inconsistent formatting.** Some labels list interactions as structured tables; others use dense paragraphs. The NLP pipeline handles sentence-level patterns but cannot reliably extract structured data from table-formatted text within the narrative field.

**Drug class references.** A large proportion of interaction statements refer to drug classes rather than specific drugs: "NSAIDs may reduce the antihypertensive effects of ACE inhibitors" rather than naming a specific NSAID. The pipeline cannot automatically expand class references to all concrete drug pairs — this would require resolving class membership, which is a separate data problem. Class-level statements are currently logged but not promoted to concrete interaction pairs without human review.

**Vague or hedged language.** Many label statements use language such as "may interact," "potential for interaction," or "interaction studies have not been conducted." These produce low confidence scores and are typically held in the review queue.

**Label age and source variability.** Labels in the FDA database range from recently updated to decades old. An older label's `drug_interactions` section may not reflect current clinical knowledge or may reference drugs that have since been withdrawn. The `confidence` score does not account for label age; reviewers should check the label date during manual review.

**No contradiction detection.** The pipeline does not compare extracted pairs against existing database records for contradictions (e.g., one label stating an interaction exists while another for the same drug pair says it does not). Contradiction detection is a future pipeline enhancement.

These limitations mean that NLP-extracted interaction pairs carry inherently lower certainty than ONCHigh-sourced pairs. The `confidence` field in API responses is the primary signal of this distinction. Applications that require the highest level of data reliability should filter on `confidence: null` (curated pairs only) or `confidence >= 0.9` depending on their risk tolerance.
