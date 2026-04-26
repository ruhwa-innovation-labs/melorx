# Security Overview

## Threat Model

### What melorx protects

**Data integrity of the DDI dataset.** The canonical interaction pairs, severity classifications,
source citations, and confidence scores are the core value of the system. The threat model
addresses unauthorized modification of dataset records, ingestion of data from unlicensed or
low-quality sources, and silent corruption of interaction pairs during the ETL pipeline. SHA-256
checksums on all ingestion source files are verified before any processing begins. Entries
missing a `sources[]` citation are rejected by CI schema validation and cannot enter the
database.

**API availability.** The hosted demo is a developer-facing reference endpoint. Denial-of-service
or abuse that degrades availability for legitimate users is a real concern. Rate limiting is
enforced at the ingress layer (see [Rate Limiting](#rate-limiting)).

**No PHI is present in the system.** The API accepts only drug identifiers — RxCUI, NDC, or
drug name. No patient identifiers, names, dates of birth, prescriber identifiers, or any
HIPAA-defined PHI ever enter the request path, the database, or the logs. This is a
**design constraint enforced at the schema and validation layers**, not merely a policy
statement.

### What melorx does not protect

melorx does not contain patient data, prescribing records, clinical notes, or any data that
could be de-identified or re-identified. There is no patient data to protect. Threat scenarios
involving PHI exfiltration, patient re-identification, HIPAA breach notification, or clinical
record tampering are out of scope because the data surface does not exist.

melorx is not a clinical decision support system (CDSS) and does not make prescribing
determinations. It does not protect against clinical misuse by downstream applications — that
responsibility belongs to the integrating application and the clinicians who review its output.

---

## Legal Positioning

melorx is an **informational drug interaction reference tool**. It is not a clinical decision
system, a CDSS, a prescribing authority, or a replacement for a licensed clinical pharmacist.

This distinction is architectural, not cosmetic. The specific failure mode being mitigated is:
a downstream application surfaces an API response — particularly a "no interaction found"
result — and a clinician relies on it without independent verification, resulting in a
preventable adverse drug event.

The safeguards are:

**The `disclaimer` field is non-suppressible.** Every response from any `/v1/interactions*`
endpoint includes a `disclaimer` field injected by middleware. This injection occurs at the
framework layer and cannot be disabled by the API caller, query parameters, request headers,
or configuration. The disclaimer text reads:

> "melorx is for informational purposes only. It does not constitute medical advice and must
> not replace clinical judgment. Always consult a licensed healthcare professional."

**Response language presents documented facts, not clinical determinations.** API responses
describe what has been documented in the cited sources. The language is factual and
attributable: "A moderate interaction between X and Y has been documented in [source]." The
API does not produce statements of the form "These drugs must not be co-administered" or "It
is safe to use these drugs together," which would constitute clinical advice.

**Apache 2.0 warranty and liability disclaimer.** The license explicitly disclaims any warranty
of fitness for a particular purpose, including fitness for clinical use. No warranty is provided
that the dataset is complete, current, or correct. Users of the API bear full responsibility for
evaluating whether the data is appropriate for their specific application.

**Pre-v1.0 clinical review requirement.** A licensed clinical pharmacist reviews the ONCHigh
dataset implementation before the v1.0 tag is applied. The findings and resolution are
documented in the repository. The project cannot claim "production-ready" status without this
review on record.

---

## Input Validation

All inputs to API endpoints pass through Zod schemas in `packages/core` before any database
query is constructed or executed. This applies to query parameters, path parameters, and
request bodies.

Validated fields include drug identifier format (RxCUI format, NDC format, name length limits),
batch request array bounds, and pagination parameters. Requests that fail Zod validation return
a `400` response with a structured error body. No partial or malformed input reaches the
query layer.

SQL injection via the query layer is not possible. All database queries are executed through
Drizzle ORM, which uses parameterized queries exclusively. User-supplied values are never
interpolated into SQL strings.

---

## No PHI Policy

The API accepts only drug identifiers:

- RxCUI (NLM RxNorm concept unique identifier)
- NDC (National Drug Code)
- Drug name (free text, resolved to RxCUI before any query)

The API does not accept, store, process, log, or return:

- Patient identifiers of any kind (MRN, SSN, insurance ID)
- Patient names, dates of birth, or demographic data
- Prescriber identifiers or NPI numbers
- Encounter IDs, prescription IDs, or clinical record references
- Any HIPAA-defined protected health information

This is a **design constraint**, not a policy aspiration. The database schema has no columns
for patient data. The Zod input schemas reject any input that is not a drug identifier. There
is no code path by which PHI could be submitted to or returned from the API — the fields
simply do not exist.

Operators deploying melorx in a healthcare environment should confirm that their request
construction logic does not pass patient context in drug name fields (e.g., "warfarin [patient
name]"). The API will accept and process only the drug identifier portion, but the full
request URL would appear in access logs. Operators are responsible for ensuring their HTTP
client does not construct requests containing PHI.

---

## Rate Limiting

Rate limiting applies to the hosted demo deployment only. Self-hosted deployments apply their
own rate limiting at the infrastructure layer.

| Authentication State | Limit |
|----------------------|-------|
| Unauthenticated | 60 requests/minute |
| API key bearer token | 1,000 requests/minute |

Limits are enforced per IP address for unauthenticated requests and per API key for
authenticated requests. Responses exceeding the limit return `429 Too Many Requests` with a
`Retry-After` header.

API keys for the hosted demo are available on request and are intended for developers building
integrations, not for production traffic. Production use cases should use a self-hosted
deployment.

---

## Data Integrity

Each ingestion source file is checksummed with SHA-256 before the ETL pipeline processes it.
The expected checksum for each versioned source file is stored in the pipeline configuration.
If the downloaded file does not match the expected checksum, the pipeline halts and logs an
error — the file is never processed.

This protects against:

- Corrupted downloads (network errors, partial transfers)
- Supply chain manipulation of upstream source files
- Silent upstream file changes between scheduled ingestion runs

Every interaction record in the database carries a `sources[]` array with at minimum one
source citation. The CI schema validation step rejects any dataset import that includes records
with empty `sources[]`. This constraint is enforced on both automated pipeline imports and
community-contributed PR submissions.

---

## Dependency Audit

`pnpm audit` runs in the CI pipeline on every push. The pipeline fails on any advisory rated
`high` or `critical`. Moderate and low advisories are reported but do not block the build.

The audit step runs after `pnpm install --frozen-lockfile`, ensuring that the lockfile state
matches the installed modules. Dependency updates that introduce new high-severity advisories
will block the build and require remediation before merging.

---

## Logging

Request logs are structured JSON emitted by pino. Each log entry contains:

- HTTP method and path (with path parameters normalized, e.g., `/v1/drugs/:rxcui`)
- Response status code
- Response time in milliseconds
- Drug identifiers from query parameters (RxCUI, NDC, or resolved name)

Request logs do not contain:

- IP addresses (stripped at ingress on the hosted demo)
- API key values or fragments
- Patient identifiers or any PHI
- Request bodies beyond the normalized identifier fields

Log levels follow the pino convention: `error` for 5xx responses, `warn` for 4xx responses on
`/v1/` routes, `info` for startup events and ingestion pipeline milestones, `debug` disabled
in production.

Operators who enable `debug` logging in non-production environments should ensure that debug
output is not forwarded to any external log aggregator that may retain data beyond the
deployment's own retention policy.

---

## License Boundary

melorx is released under the Apache License 2.0. The license includes:

- An express grant of patent rights from all contributors
- A disclaimer of all warranties, including warranties of merchantability and fitness for a
  particular purpose
- A limitation of liability for all contributors

The license disclaimer of warranty and limitation of liability apply without exception to
clinical use. The project makes no representation that the dataset is complete, accurate, or
current. No contributor warrants fitness of this software for use in clinical decision-making,
prescribing, dispensing, or any other clinical function.

**Dataset license contamination.** The dataset may only include data from sources licensed
under terms compatible with Apache 2.0 redistribution. The following sources are permanently
excluded from ingestion because their licenses are incompatible:

- SIDER (CC BY-NC — no commercial redistribution)
- DrugBank (CC BY-NC — no commercial redistribution)
- DDInter (research-only license)

Any community contribution that cites one of these sources as the sole citation for an
interaction record will be rejected. Contributors must cite primary literature, FDA labels
(public domain), or ONCHigh/NDF-RT (public domain) as the basis for submitted records.

---

## Pre-v1.0 Clinical Review Requirement

The v1.0 tag will not be applied until a licensed clinical pharmacist has reviewed the
ONCHigh dataset implementation — specifically: the severity mappings, the mechanism text,
the management recommendations, and the source citations for each of the 437 seeded
interaction pairs.

The pharmacist review findings and any resulting corrections are documented in the repository
under `docs/clinical-review/`. This record is public and auditable.

This requirement exists because the project's credibility depends on expert human validation
of the most critical dataset tier before the API is presented as production-ready. Automated
ingestion and CI validation are necessary but not sufficient — clinical accuracy requires
clinical expertise.
