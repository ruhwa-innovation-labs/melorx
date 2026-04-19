# API Overview

melo-rx exposes a versioned REST API for drug-drug interaction queries, identifier resolution, and dataset metadata. All endpoints return JSON.

> **NOT FOR CLINICAL DECISION-MAKING.** melo-rx is a drug interaction reference and documentation tool. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional before making prescribing or dispensing decisions.

---

## Base URL

```
/v1/...
```

For the hosted demo:

```
https://api.melo-rx.dev/v1/...
```

Self-hosted deployments use whatever base URL the operator configures. The `/v1/` prefix is part of every API path regardless of deployment.

---

## Authentication

Authentication behavior depends on deployment mode.

### Self-hosted

No authentication is required or enforced. The operator is responsible for access control at the infrastructure level (network policy, reverse proxy auth, etc.).

### Hosted demo

| Mode | Rate limit | How to activate |
|------|-----------|-----------------|
| Unauthenticated | 60 requests/minute | No setup required |
| API key | 1,000 requests/minute | Pass `Authorization: Bearer <api_key>` header |

API keys for the hosted demo are issued via the project's GitHub Sponsors page. They are intended for development and evaluation use, not production traffic. For production use, deploy your own instance.

---

## Versioning Policy

The `/v1/` prefix indicates the stable API version. Within v1, all changes are backwards-compatible: new fields may be added to response bodies, but existing fields will not be removed or renamed. Breaking changes — including field removal, type changes, or semantic changes to existing fields — will be released under `/v2/` with an advance deprecation notice of no less than 90 days.

The `meta.version` field in every response reflects the running API server version. The `meta.dataset_version` field reflects the date of the most recently ingested dataset snapshot.

---

## Endpoints

### Identifier Resolution

#### `GET /v1/drugs/resolve`

Resolves a drug name, NDC code, or ATC code to a canonical RxCUI and returns the matching drug concept.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Drug name (e.g. `ibuprofen`), NDC code (e.g. `0005-0118`), brand name (e.g. `Advil`), or ATC code |

**Response shape**

```json
{
  "data": {
    "rxcui": "5640",
    "name": "Ibuprofen",
    "drug_class": ["NSAID", "COX-2 inhibitor"],
    "identifiers": {
      "ndc": ["0005-0118", "0573-0164"],
      "atc": "M01AE01",
      "brand_names": ["Advil", "Motrin"]
    }
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 3
  }
}
```

**Example**

```
GET /v1/drugs/resolve?q=ibuprofen
GET /v1/drugs/resolve?q=0005-0118
GET /v1/drugs/resolve?q=Advil
```

---

#### `GET /v1/drugs/:rxcui`

Returns the full drug concept record for a known RxCUI.

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `rxcui` | string | RxNorm Concept Unique Identifier |

**Response shape**

Same shape as `GET /v1/drugs/resolve`.

**Example**

```
GET /v1/drugs/5640
```

---

### Interaction Queries

#### `GET /v1/interactions`

Checks for a known drug-drug interaction between two drugs identified by RxCUI.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `drug1` | string | Yes | RxCUI of the first drug |
| `drug2` | string | Yes | RxCUI of the second drug |

**Response shape**

```json
{
  "data": {
    "drug1": { "rxcui": "5640", "name": "Ibuprofen", "classes": ["NSAID"] },
    "drug2": { "rxcui": "29046", "name": "Lisinopril", "classes": ["ACE inhibitor"] },
    "interactions": [
      {
        "severity": "moderate",
        "mechanism": "NSAIDs antagonize the antihypertensive effect of ACE inhibitors via prostaglandin-mediated renal vasodilation inhibition.",
        "management": "Monitor blood pressure. Consider acetaminophen as an alternative analgesic.",
        "sources": [
          {
            "name": "ONCHigh",
            "type": "clinical_guideline",
            "url": "https://oncprojectracking.healthit.gov/wiki/display/TechLabSC/CDS+Connect",
            "accessed": "2025-01-01"
          }
        ],
        "confidence": null
      }
    ]
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 4
  }
}
```

When no interaction is found, `interactions` is an empty array and the HTTP status is `200`.

**Severity values**

| Value | Meaning |
|-------|---------|
| `contraindicated` | Never co-administer |
| `serious` | Avoid unless benefit outweighs risk |
| `moderate` | Use with caution and monitoring |
| `minor` | Minimal clinical significance |
| `monitor` | Theoretical — monitor only |

**The `confidence` field**

`null` indicates the interaction record was curated from a structured source (ONCHigh, NDF-RT, or a reviewed community contribution). A numeric value between `0.0` and `1.0` indicates the record was extracted from an OpenFDA drug label via NLP. Pairs with `confidence < 0.75` are not served via the API until manually approved. See the OpenFDA integration documentation for details.

**Example**

```
GET /v1/interactions?drug1=5640&drug2=29046
```

---

#### `POST /v1/interactions/batch`

Checks interactions for multiple drug pairs in a single request. Useful for polypharmacy screening where a patient is taking more than two medications. Each pair accepts the same identifier types as `GET /v1/interactions`: RxCUI, NDC, brand name, or canonical name.

**Request body**

```json
{
  "pairs": [
    { "drug1": "5640", "drug2": "29046" },
    { "drug1": "ibuprofen", "drug2": "warfarin" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pairs` | array | Yes | 1–50 pair objects. 400 on empty array or more than 50 entries. |
| `pairs[].drug1` | string | Yes | Drug identifier (RxCUI, NDC, brand, or name). |
| `pairs[].drug2` | string | Yes | Drug identifier (RxCUI, NDC, brand, or name). |

**Response shape — partial-success semantics**

Pairs resolve independently. Successful pairs land in `data[]` in input order; unresolved pairs go to `errors[]` indexed by their input position. The HTTP status is always 200 when validation passes; consumers should inspect `errors[]` and `meta.pairs_failed` to detect individual failures.

```json
{
  "data": [
    {
      "drug1": { "rxcui": "5640", "name": "ibuprofen", "classes": [] },
      "drug2": { "rxcui": "29046", "name": "lisinopril", "classes": [] },
      "interactions": [ { "severity": "moderate", "mechanism": "...", "management": "...", "sources": [...], "confidence": null } ]
    }
  ],
  "errors": [
    { "index": 1, "error": "DRUG_NOT_FOUND", "drug": "notadrug99999" }
  ],
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "0.1.0",
    "dataset_version": "2026-04-19",
    "query_time_ms": 11,
    "pairs_requested": 2,
    "pairs_resolved": 1,
    "pairs_failed": 1
  }
}
```

**Example**

```
POST /v1/interactions/batch
Content-Type: application/json

{
  "pairs": [
    { "drug1": "5640", "drug2": "29046" },
    { "drug1": "ibuprofen", "drug2": "warfarin" }
  ]
}
```

---

#### `GET /v1/drugs/:rxcui/interactions`

Returns all known interactions for a given drug, across all interaction pairs that include it.

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `rxcui` | string | RxNorm Concept Unique Identifier |

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `severity` | string | No | Filter by severity. One of `contraindicated`, `serious`, `moderate`, `minor`, `monitor` |

**Response shape**

```json
{
  "data": {
    "drug": { "rxcui": "5640", "name": "Ibuprofen", "classes": ["NSAID"] },
    "interactions": [
      {
        "interacts_with": { "rxcui": "29046", "name": "Lisinopril", "classes": ["ACE inhibitor"] },
        "severity": "moderate",
        "mechanism": "...",
        "management": "...",
        "sources": [...],
        "confidence": null
      }
    ]
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 6
  }
}
```

**Example**

```
GET /v1/drugs/5640/interactions
GET /v1/drugs/5640/interactions?severity=contraindicated
```

---

### Dataset Metadata

#### `GET /v1/drugs/classes`

Returns all known drug classes present in the dataset, derived from the `drug_class` column on `drug_concept` records.

**Response shape**

```json
{
  "data": {
    "classes": [
      "NSAID",
      "ACE inhibitor",
      "Anticoagulant",
      "Beta blocker",
      "...etc"
    ]
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 2
  }
}
```

**Example**

```
GET /v1/drugs/classes
```

---

#### `GET /v1/meta/stats`

Returns aggregate statistics about the dataset: total drug concepts, total interaction pairs, breakdown by source, and the timestamp of the last ingestion run.

**Response shape**

```json
{
  "data": {
    "drug_concepts": 12450,
    "interaction_pairs": 5832,
    "by_source": {
      "onc_high": 437,
      "ndf_rt": 2891,
      "openfda_nlp": 2504
    },
    "last_ingestion": "2026-04-01T02:00:00Z",
    "dataset_version": "2026-04-14"
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 1
  }
}
```

**Example**

```
GET /v1/meta/stats
```

---

### Operations

#### `GET /health`

Liveness probe. Returns `200 OK` with a brief status payload when the API server and database connection are healthy. Returns `503 Service Unavailable` if the database is unreachable.

Note: this endpoint is at the root path — not prefixed with `/v1/`.

**Response shape (healthy)**

```json
{
  "status": "ok",
  "db": "connected",
  "uptime_seconds": 84320
}
```

**Response shape (degraded)**

```json
{
  "status": "degraded",
  "db": "unreachable",
  "uptime_seconds": 84320
}
```

---

#### `GET /metrics`

Returns operational metrics in Prometheus text exposition format. Intended for scraping by a Prometheus server or compatible collector (e.g. Grafana Agent, Victoria Metrics).

Note: this endpoint is at the root path — not prefixed with `/v1/`.

Exposed metrics include:

- `melo_rx_requests_total` — total requests by endpoint and status code
- `melo_rx_request_duration_seconds` — request latency histogram
- `melo_rx_interaction_queries_total` — interaction query count
- `melo_rx_drug_concepts_total` — total drug concepts in the database
- `melo_rx_interaction_pairs_total` — total interaction pairs in the database

**Example response (excerpt)**

```
# HELP melo_rx_requests_total Total HTTP requests
# TYPE melo_rx_requests_total counter
melo_rx_requests_total{endpoint="/v1/interactions",status="200"} 14832
melo_rx_requests_total{endpoint="/v1/drugs/resolve",status="200"} 3201
melo_rx_requests_total{endpoint="/v1/interactions",status="404"} 112
```

---

## Standard Response Envelope

Every response from the API — success or error — wraps its payload in a consistent envelope:

```json
{
  "data": { ... },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 4
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | object or array | The response payload for the requested endpoint |
| `disclaimer` | string | Non-suppressible medical disclaimer (see below) |
| `meta.version` | string | Running API server version (semver) |
| `meta.dataset_version` | string | Date of the most recently ingested dataset snapshot (ISO 8601) |
| `meta.query_time_ms` | number | Server-side query execution time in milliseconds |

---

## The Disclaimer Field

The `disclaimer` field is present in every response from every endpoint. It is injected by middleware at the server level and **cannot be suppressed, omitted, or overridden by the caller**. There is no query parameter, header, or API key scope that removes it.

This is an intentional architectural constraint, not a limitation. melo-rx is a drug interaction reference tool. A missing "no interaction found" response, if acted upon without clinical judgment, could contribute to a preventable adverse drug event. The disclaimer exists to clearly frame the informational — not clinical — nature of the data returned, and to protect developers who build on melo-rx from unintentional over-reliance in user-facing workflows.

Applications are expected to surface this disclaimer appropriately to their users. It should not be hidden in a tooltip or collapsed by default in any context where drug interaction data is being displayed.

---

## Error Responses

Errors follow the same envelope structure. The `data` field is replaced by an `error` object.

**Error response shape**

```json
{
  "error": {
    "code": "DRUG_NOT_FOUND",
    "message": "No drug concept found for RxCUI '99999'.",
    "status": 404
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "1.0.0",
    "dataset_version": "2026-04-14",
    "query_time_ms": 1
  }
}
```

**Error codes**

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | `INVALID_INPUT` | A required parameter is missing, malformed, or fails Zod schema validation |
| 400 | `BATCH_LIMIT_EXCEEDED` | The batch request contains more than 50 pairs |
| 404 | `DRUG_NOT_FOUND` | No drug concept was found for the provided identifier |
| 404 | `RXCUI_NOT_FOUND` | The provided RxCUI does not exist in the local database |
| 429 | `RATE_LIMIT_EXCEEDED` | The request was rejected due to rate limiting |
| 500 | `INTERNAL_ERROR` | An unexpected server-side error occurred |
| 503 | `SERVICE_UNAVAILABLE` | The API is degraded (typically: database unreachable) |

---

## Rate Limiting

Rate limiting applies only on the hosted demo. Self-hosted deployments have no built-in rate limiting — operators may configure limits at the reverse proxy layer.

**Headers returned on every response (hosted demo)**

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the current window resets |

**Example**

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1744668120
```

When the limit is exceeded, the API responds with `HTTP 429` and a `Retry-After` header indicating how many seconds to wait before retrying.

```
HTTP/1.1 429 Too Many Requests
Retry-After: 34
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1744668120
```
