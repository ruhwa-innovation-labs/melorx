# RxNorm / NLM Integration

## Purpose

RxNorm is used as the canonical drug identifier system throughout melorx. Drug concepts in the database are keyed by **RxCUI** (RxNorm Concept Unique Identifier) — a stable, versioned identifier maintained by the U.S. National Library of Medicine (NLM).

The Resolver Service translates any supported input — brand names, NDC codes, ATC codes, or free-text drug names — into a canonical RxCUI before any interaction query is executed against the database. This normalization step is mandatory: no interaction lookup bypasses the resolver.

---

## API Base URL

```
https://rxnav.nlm.nih.gov/REST
```

This is the NLM RxNav REST API, which provides access to the RxNorm dataset for drug name search and identifier crosswalk. It is a distinct service from the RxNav drug interaction APIs that were decommissioned on January 2, 2024. The RxNorm normalization endpoints referenced in this document remain active.

All requests to this API are read-only HTTP GET requests. No authentication is required.

---

## Key Endpoints

### Search by drug name

```
GET https://rxnav.nlm.nih.gov/REST/rxcui?name={name}&search=1
```

Searches for a drug concept by name and returns a matching RxCUI. The `search=1` parameter enables approximate matching — useful when the input is a brand name, a common misspelling, or a partial name.

**Example request**

```
GET https://rxnav.nlm.nih.gov/REST/rxcui?name=ibuprofen&search=1
```

**Example response (excerpt)**

```json
{
  "idGroup": {
    "name": "ibuprofen",
    "rxnormId": ["5640"]
  }
}
```

When `rxnormId` is empty, the drug name did not resolve to a known concept. The resolver should fall back to the local cache or return a `DRUG_NOT_FOUND` error.

---

### Get NDCs for a known RxCUI

```
GET https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/ndcs
```

Returns all National Drug Codes (NDCs) associated with a given RxCUI. Used to populate or refresh the `identifiers.ndc` array in the `drug_concept` table.

**Example request**

```
GET https://rxnav.nlm.nih.gov/REST/rxcui/5640/ndcs
```

**Example response (excerpt)**

```json
{
  "ndcGroup": {
    "ndcList": {
      "ndc": ["0005-0118-23", "0573-0164-16", "50580-506-01"]
    }
  }
}
```

---

### Lookup RxCUI by NDC

```
GET https://rxnav.nlm.nih.gov/REST/rxcui?idtype=NDC&id={ndc}
```

Resolves an NDC code to its corresponding RxCUI. Used when an API caller provides an NDC as the drug identifier instead of a name or RxCUI.

**Example request**

```
GET https://rxnav.nlm.nih.gov/REST/rxcui?idtype=NDC&id=0005-0118-23
```

**Example response (excerpt)**

```json
{
  "idGroup": {
    "name": "Ibuprofen 200 MG Oral Tablet",
    "rxnormId": ["310965"]
  }
}
```

---

## Caching Strategy

To avoid excessive calls to the NLM API and to ensure availability when NLM is unreachable, the resolver maintains a local cache of resolved drug concepts in the `drug_concept` table.

Resolved identifier data is stored in the `identifiers` JSONB column on `drug_concept`:

```json
{
  "ndc": ["0005-0118-23", "0573-0164-16"],
  "atc": "M01AE01",
  "brand_names": ["Advil", "Motrin"],
  "drugbank": "DB01050"
}
```

**Cache behavior**

- On an incoming resolve request, the resolver checks the local database first.
- If a cached entry exists and is not stale (see TTL below), the NLM API is not called.
- If the entry is missing or stale, the resolver calls the NLM API, updates the database, and returns the result.
- The `updated_at` timestamp on the `drug_concept` row is used to determine cache staleness.

**TTL**

Cached RxNorm entries are considered fresh for **30 days** after their last update. After 30 days, the next resolve request for that concept triggers a background refresh from the NLM API. The stale value is returned immediately while the refresh runs asynchronously, so the caller does not wait for the network round-trip.

This TTL is a balance between data freshness and NLM rate limit compliance. The NLM updates the RxNorm dataset monthly; a 30-day TTL means entries are refreshed at roughly the same cadence as upstream changes.

---

## NLM Rate Limits

The NLM recommends no more than **20 requests per second** to the RxNav REST API. Exceeding this can result in temporary blocks.

The resolver must enforce this limit using a **token bucket** or **delay queue** implementation before making any outbound NLM request. A token bucket with a capacity of 20 tokens and a refill rate of 20 tokens/second is the recommended implementation.

Bulk operations — such as seeding the database with a large set of drug names during ingestion — must route all NLM calls through the same rate-limited queue as runtime resolve requests. Ingestion jobs should not bypass the rate limiter.

---

## Fallback Behavior

If the NLM API is unreachable (network failure, timeout, or non-2xx response):

1. The resolver logs the failure at `warn` level, including the queried identifier and the error type.
2. If a cached entry exists in the local database, it is returned regardless of its age. The `meta` block in the response should not expose cache staleness to callers; this is an internal operational concern.
3. If no cached entry exists and NLM is unreachable, the resolver returns a `DRUG_NOT_FOUND` error to the caller and logs the miss at `error` level with the identifier.

The hosted demo exposes `/metrics` with a counter for NLM cache misses (`melorx_rxnorm_cache_miss_total`) so that elevated miss rates can be detected and alerted on.

---

## RxCUI Deprecation Handling

The NLM periodically retires RxCUI values as the RxNorm dataset evolves — concepts are merged, split, or superseded. A retired RxCUI may still appear in stored data or be passed in by a caller using an older identifier.

The resolver handles deprecated CUIs as follows:

1. When a resolve request is made for a CUI that is not in the local database, or when a database entry is flagged as potentially stale, the resolver calls the RxNorm history status endpoint:

```
GET https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/historystatus
```

2. If the response indicates the CUI is **retired** and provides a remapping (a `remappedRxCui` value), the resolver follows the chain to the active replacement CUI.

3. The resolver follows remapping chains up to a maximum depth of **5 hops** to prevent infinite loops in pathological cases. If no active CUI is found within the chain, the resolver logs a warning and returns `DRUG_NOT_FOUND`.

4. When a remapping is resolved, the local `drug_concept` record is updated: the deprecated RxCUI is retained as a legacy identifier in the `identifiers` JSONB column, and the canonical `rxcui` column is updated to the active replacement value. This ensures that existing stored interaction records that reference the old RxCUI remain valid.

Operators running long-lived self-hosted deployments should schedule a periodic job (monthly is sufficient) to check all `drug_concept` records against the history status endpoint and apply any new remappings.
