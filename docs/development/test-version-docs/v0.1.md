# melo-rx v0.1 — Manual Testing Guide

This guide walks you through verifying every endpoint and behaviour implemented in v0.1 from scratch. Run each command in sequence; expected output is shown beneath each step.

---

## Prerequisites

- Docker running
- Node.js 22+ and pnpm 9+ installed
- Repository cloned and at the repo root

---

## 1. Environment setup

```bash
# Install dependencies
pnpm install

# Verify .env exists (created from .env.example)
cat .env
```

Expected output:
```
DATABASE_URL=postgres://melo:melo@localhost:5435/melo_rx
DATABASE_POOL_SIZE=10
RXNORM_API_BASE=https://rxnav.nlm.nih.gov/REST
API_PORT=3000
LOG_LEVEL=info
NODE_ENV=development
NLP_CONFIDENCE_THRESHOLD=0.75
HOSTED_MODE=false
```

If `.env` doesn't exist yet:
```bash
cp .env.example .env
```

---

## 2. Start the database

```bash
docker compose up -d
```

Wait ~10 seconds, then verify the container is healthy:

```bash
docker compose ps
```

Expected: `melo-rx-postgres-1` with status `(healthy)`.

---

## 3. Run database migrations

```bash
pnpm db:migrate
```

Expected output ends with something like:
```
All migrations have been applied
```

Verify the three tables were created:

```bash
docker exec $(docker compose ps -q postgres) psql -U melo -d melo_rx -c "\dt"
```

Expected:
```
        List of relations
 Schema |          Name          | Type  | Owner
--------+------------------------+-------+-------
 public | drug_class_interaction | table | melo
 public | drug_concept           | table | melo
 public | drug_interaction       | table | melo
```

---

## 4. Seed the database

```bash
pnpm db:seed
```

Expected:
```
Seeding 5 ONCHigh interactions...
Done. Inserted: 5, Skipped (already present): 0
```

Verify the data:

```bash
docker exec $(docker compose ps -q postgres) psql -U melo -d melo_rx \
  -c "SELECT rxcui, name FROM drug_concept ORDER BY name;"
```

Expected: 8 rows (ibuprofen appears once even though it's in 2 interactions):
```
  rxcui  |      name
---------+----------------
 703     | amiodarone
 1191    | aspirin
 1897158 | calcium carbonate
 2551    | ciprofloxacin
 5640    | ibuprofen
 29046   | lisinopril
 856584  | methotrexate
 36567   | simvastatin
 41493   | tramadol
 36437   | sertraline
 11289   | warfarin
```

(Exact count may vary — ibuprofen and others may be shared across entries.)

```bash
docker exec $(docker compose ps -q postgres) psql -U melo -d melo_rx \
  -c "SELECT drug1_rxcui, drug2_rxcui, severity FROM drug_interaction ORDER BY severity;"
```

Expected: 5 rows — note that the `significant` ONCHigh entry was canonicalised to `moderate`:
```
 drug1_rxcui | drug2_rxcui |    severity
-------------+-------------+-----------------
 36567       | 703         | contraindicated
 5640        | 29046       | moderate
 11289       | 1191        | serious
 856584      | 5640        | serious
 41493       | 36437       | serious
```

---

## 5. Run the automated test suite

```bash
pnpm test
```

Expected:
```
packages/core      1 test file  7 tests passed
packages/api       4 test files 21 tests passed
pipeline           1 test file  5 tests passed

Test Suites: 6 passed, 6 total
Tests:       33 passed, 33 total
```

---

## 6. Run typecheck

```bash
pnpm typecheck
```

Expected: no output (zero errors across all packages).

---

## 7. Start the development server

```bash
pnpm dev
```

Expected log output (JSON or pretty-printed depending on `NODE_ENV`):
```
{"level":30,"msg":"melo-rx API started","port":3000}
```

Leave this running and open a second terminal for the curl tests below.

---

## 8. Health endpoint

```bash
curl -s http://localhost:3000/health | jq .
```

Expected:
```json
{
  "status": "ok",
  "db": "connected",
  "version": "0.1.0"
}
```

---

## 9. Drug resolution endpoints

### 9.1 Resolve by RxCUI

```bash
curl -s "http://localhost:3000/v1/drugs/resolve?q=5640" | jq .
```

Expected: ibuprofen with rxcui `5640`.

### 9.2 Resolve by name (case-insensitive)

```bash
curl -s "http://localhost:3000/v1/drugs/resolve?q=Ibuprofen" | jq .
```

Expected: same result — name match is case-insensitive.

```bash
curl -s "http://localhost:3000/v1/drugs/resolve?q=WARFARIN" | jq .
```

Expected: warfarin with rxcui `11289`.

### 9.3 Resolve unknown drug → 404

```bash
curl -s "http://localhost:3000/v1/drugs/resolve?q=notadrug99999" | jq .
```

Expected:
```json
{
  "error": "DRUG_NOT_FOUND",
  "message": "No drug found for query: notadrug99999"
}
```

### 9.4 Missing `q` param → 400

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/drugs/resolve"
```

Expected: `400`

### 9.5 Get drug by RxCUI directly

```bash
curl -s "http://localhost:3000/v1/drugs/29046" | jq .
```

Expected: lisinopril with rxcui `29046`.

### 9.6 Get unknown RxCUI → 404

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/drugs/XXXXXX"
```

Expected: `404`

---

## 10. Interactions endpoint

### 10.1 Known interaction by RxCUI

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=5640&drug2=29046" | jq .
```

Expected response shape (check these fields):
- `data.interactions[0].severity` → `"moderate"` (ONCHigh "significant" → canonical "moderate")
- `data.interactions[0].sources` → array with 1 ONCHigh citation
- `disclaimer` → present and non-empty
- `meta.version` → `"0.1.0"`

Full expected response:
```json
{
  "data": {
    "drug1": { "rxcui": "5640", "name": "ibuprofen", "classes": [] },
    "drug2": { "rxcui": "29046", "name": "lisinopril", "classes": [] },
    "interactions": [
      {
        "severity": "moderate",
        "mechanism": "NSAIDs antagonise the antihypertensive effect of ACE inhibitors via prostaglandin-mediated inhibition of renal vasodilation.",
        "management": "Monitor blood pressure. Consider acetaminophen as an alternative analgesic.",
        "sources": [
          {
            "name": "ONCHigh",
            "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3817532/",
            "type": "clinical_guideline",
            "accessed_date": "2026-04-15"
          }
        ],
        "confidence": null
      }
    ]
  },
  "disclaimer": "melo-rx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.",
  "meta": {
    "version": "0.1.0",
    "dataset_version": "<today's date>",
    "query_time_ms": <number>
  }
}
```

### 10.2 Bidirectional — same result regardless of drug order

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=29046&drug2=5640" | jq '.data.interactions[0].severity'
```

Expected: `"moderate"` — same as 10.1 with drugs swapped.

### 10.3 Known interaction by drug name

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=ibuprofen&drug2=lisinopril" | jq '.data.interactions[0].severity'
```

Expected: `"moderate"` — name resolution works.

### 10.4 Contraindicated interaction

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=36567&drug2=703" | jq '.data.interactions[0].severity'
```

Expected: `"contraindicated"` (simvastatin + amiodarone).

### 10.5 Serious interaction

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=11289&drug2=1191" | jq '.data.interactions[0].severity'
```

Expected: `"serious"` (warfarin + aspirin).

### 10.6 No known interaction → empty array

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=11289&drug2=29046" | jq '.data.interactions'
```

Expected: `[]` (warfarin + lisinopril — both in DB, no seeded interaction between them). Response status 200.

### 10.7 Disclaimer always present — even on errors

```bash
curl -s "http://localhost:3000/v1/interactions?drug1=notadrug&drug2=5640" | jq '{status: .error, disclaimer_present: (.disclaimer != null)}'
```

Expected:
```json
{
  "status": "DRUG_NOT_FOUND",
  "disclaimer_present": true
}
```

### 10.8 Missing `drug2` param → 400

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/interactions?drug1=5640"
```

Expected: `400`

### 10.9 Missing both params → 400

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/v1/interactions"
```

Expected: `400`

---

## 11. Stop the server

```bash
# Press Ctrl+C in the terminal running pnpm dev
# Or from the other terminal:
pkill -f "tsx.*watch.*src/index.ts"
```

---

## 12. Re-seed idempotency check

Run the seed a second time — it should skip all existing pairs:

```bash
pnpm db:seed
```

Expected:
```
Seeding 5 ONCHigh interactions...
Done. Inserted: 0, Skipped (already present): 5
```

---

## 13. Stop the database

```bash
docker compose down
```

To also remove the stored data volume (full reset):
```bash
docker compose down -v
```

---

## Summary checklist

| # | Test | Expected |
|---|------|----------|
| 5 | `pnpm test` | 33 tests pass |
| 6 | `pnpm typecheck` | 0 errors |
| 8 | `GET /health` | `{"status":"ok","db":"connected"}` |
| 9.1 | Resolve RxCUI 5640 | ibuprofen |
| 9.2 | Resolve name `Ibuprofen` | rxcui 5640 |
| 9.3 | Resolve unknown drug | 404 DRUG_NOT_FOUND |
| 9.4 | Missing `q` param | 400 |
| 9.5 | Get drug by RxCUI | drug concept |
| 10.1 | 5640+29046 | severity: moderate + disclaimer |
| 10.2 | 29046+5640 (reversed) | same result |
| 10.3 | ibuprofen+lisinopril (names) | same result |
| 10.4 | simvastatin+amiodarone | severity: contraindicated |
| 10.5 | warfarin+aspirin | severity: serious |
| 10.6 | warfarin+lisinopril | empty interactions array |
| 10.7 | Unknown drug interaction | 404 with disclaimer |
| 10.8 | Missing `drug2` | 400 |
| 12 | Re-seed | 0 inserted, 5 skipped |
