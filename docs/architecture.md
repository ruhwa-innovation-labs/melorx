# melo-rx — System Architecture

## Architecture Pattern

melo-rx is a **modular monolith** organized as a **pnpm workspace**. All packages live in a single repository and share types from `packages/core`, but each package has a clearly defined responsibility boundary. The data pipeline, query engine, and delivery surface are deliberately kept separate so each can be replaced, extended, or scaled independently without touching the others.

---

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  melo-rx                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Ingestion Pipeline                           │    │
│  │                                                                     │    │
│  │   ┌──────────────┐  ┌──────────────┐                              │    │
│  │   │  onc-high/   │  │  openfda/    │                              │    │
│  │   │  ETL adapter │  │  bulk label  │                              │    │
│  │   │  + class     │  │  + NLP       │                              │    │
│  │   │  rules       │  │  (v0.3)      │                              │    │
│  │   └──────┬───────┘  └──────┬───────┘                              │    │
│  │          │                  │                                     │    │
│  │          └──────────────────┘                                     │    │
│  │                             │                                      │    │
│  │                    ┌────────▼────────┐                             │    │
│  │                    │    Resolver     │                             │    │
│  │                    │    Service      │                             │    │
│  │                    │  RxCUI ↔ NDC ↔  │                             │    │
│  │                    │  ATC ↔ brand    │                             │    │
│  │                    └────────┬────────┘                             │    │
│  └─────────────────────────────│────────────────────────────────────┘    │
│                                │                                           │
│                                ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                       PostgreSQL 16                                 │  │
│  │                                                                     │  │
│  │   drug_concept   drug_class_interaction   drug_interaction          │  │
│  │   (RxCUI, name,  (class_a, class_b,       (drug1_rxcui,            │  │
│  │    identifiers    severity, sources[])      drug2_rxcui,            │  │
│  │    JSONB,                                   severity,               │  │
│  │    drug_class[])                            confidence,             │  │
│  │                                             sources[] JSONB)        │  │
│  └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         REST API (Hono)                             │  │
│  │                                                                     │  │
│  │   GET  /v1/drugs/resolve          POST /v1/interactions/batch       │  │
│  │   GET  /v1/drugs/:rxcui           GET  /v1/drugs/:rxcui/interactions│  │
│  │   GET  /v1/interactions           GET  /v1/meta/stats               │  │
│  │   GET  /health                    GET  /metrics                     │  │
│  │                                                                     │  │
│  │   [ disclaimer middleware — injected on all /v1/interactions* ]     │  │
│  └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     npm Package (@melo-rx/client)                   │  │
│  │                                                                     │  │
│  │   checkInteraction(drug1, drug2)                                    │  │
│  │   resolveDrug(query)                                                │  │
│  │   batchCheck([{ drug1, drug2 }])                                    │  │
│  │                                                                     │  │
│  │   TypeScript types shared from packages/core                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Layout

```
melo-rx/
├── packages/
│   ├── core/          # Canonical schema types, Zod validators, shared utilities
│   │                  # All other packages import types from here — single source of truth
│   ├── api/           # Hono REST API server
│   │                  # Disclaimer middleware, route handlers, Drizzle queries
│   ├── cli/           # Dataset inspection and ingestion CLI
│   │                  # Used for local development, seed runs, and pipeline debugging
│   └── client/        # npm package published as @melo-rx/client
│                      # Thin typed wrapper over the REST API; zero runtime deps beyond fetch
│
├── pipeline/
│   ├── sources/
│   │   ├── onc-high/  # ONCHigh ETL adapter — curated pairs (v0.1) + class rules (v0.2)
│   │   └── openfda/   # OpenFDA bulk label download + Natural.js/regex NLP extractor (v0.3)
│   └── resolver/      # Identifier normalization service
│                      # Resolves RxCUI ↔ NDC ↔ ATC ↔ brand name via local RxNorm ingest
│                      # (RXNCONSO, RXNSAT, RXNREL) populated at seed time
│
│  Note: NDF-RT adapter was removed per ADR-003 — NDF-RT is absent from the current
│  RxNorm release; class-rule expansion (v0.2) and OpenFDA NLP (v0.3) cover the gap.
│
├── db/
│   └── migrations/    # Drizzle ORM migration files (plain .sql — human-readable)
│
├── docs/              # Project documentation
│   ├── project.md
│   ├── summary.md
│   ├── architecture.md
│   └── tech-stack.md
│
└── docker-compose.yml # PostgreSQL 16 + API service for local and production deploys
```

---

## Data Flow

The following describes a single interaction query from identifier input to JSON response.

**1. Drug identifier input**

The caller provides one or more drug identifiers. Valid inputs: RxCUI, NDC code, ATC code, or a brand/generic name string. All inputs are validated by Zod in `packages/core` before any downstream processing.

**2. Resolver Service**

`pipeline/resolver` maps every input identifier to a canonical RxCUI. If the input is a brand name or NDC, the resolver queries the local RxNorm cache (populated at ingestion time from the NLM RxNorm API). Deprecated RxCUIs are resolved through their successor chains. Identifiers that cannot be resolved return a structured error — no fallback to unresolved lookups.

**3. PostgreSQL query**

The resolved RxCUI pair is used to query `drug_interaction` for a direct concrete pair match. If no concrete pair is found, the query engine checks `drug_class_interaction` for any class-level rules that cover the drug classes of either resolved concept (retrieved from `drug_concept.drug_class[]`).

**4. Class expansion**

If a matching `drug_class_interaction` rule exists, the query engine expands it dynamically to a concrete pair response, setting `is_generated = true` and attaching the originating `class_rule_id`. This expansion happens at query time — it is never pre-materialized. This avoids combinatorial table bloat as new drugs are added to existing classes.

**5. Response assembly**

The resolved drug concepts, interaction records (concrete or class-expanded), severity enum values, mechanism text, management text, source citations, and confidence scores (null for curated pairs, 0.0–1.0 for NLP-extracted pairs) are assembled into the standard response envelope by the Hono route handler.

**6. Disclaimer injection**

Hono middleware unconditionally appends the `disclaimer` field to every response from any route matching `/v1/interactions*`. This runs after the route handler and cannot be removed by route-level logic or by the caller.

**7. JSON response**

The assembled envelope — `data`, `disclaimer`, and `meta` (version, dataset_version, query_time_ms) — is returned as `application/json`. The `meta.query_time_ms` target is under 20ms on a warm, self-hosted instance.

---

## Key Design Decisions with Rationale

### Hono over Express or Fastify

Hono was chosen because it runs unchanged on Node.js, Bun, Cloudflare Workers, and Deno. Edge deployment is not a v1.0 requirement, but locking the framework to Node-only at this stage would make edge migration a rewrite rather than a configuration change. Express was eliminated because it has no first-class TypeScript support and carries decades of middleware surface area that is not needed here. Fastify was evaluated as technically viable but was set aside in favor of Hono's cleaner TypeScript DX and narrower runtime footprint.

### Drizzle ORM over Prisma or TypeORM

Prisma's query engine is a separate Rust binary that adds approximately 200ms to cold start times and requires a non-standard migration workflow. In a Docker-based deployment where cold start predictability matters, this overhead is unacceptable. Drizzle generates raw SQL, ships zero runtime dependencies, and stores migrations as plain `.sql` files that a DBA can read and audit without tooling. TypeORM was eliminated due to its reliance on decorators and its history of type inference gaps.

### PostgreSQL 16 over SQLite or MongoDB

SQLite does not support row-level security, has limited JSONB equivalents, and is not suitable for multi-connection server workloads. MongoDB was eliminated because the relational integrity between `drug_concept`, `drug_class_interaction`, and `drug_interaction` is a core data correctness requirement — enforcing foreign key constraints and unique pair constraints is significantly more reliable in a relational model. PostgreSQL's JSONB type handles the dynamic `sources[]` array and `identifiers` map without requiring a separate document store. The pgvector extension is available for future semantic drug search without adding infrastructure.

### Apache 2.0 over MIT

The Apache 2.0 license includes an explicit patent grant that MIT does not. In healthcare software, where pharmaceutical companies hold broad drug interaction-related patents, the explicit patent grant is meaningful protection for downstream adopters. This is particularly relevant for EHR vendors and clinical systems integrators who must pass legal review before adopting open-source dependencies.

### RxCUI as canonical identifier

RxNorm is the US national standard for clinical drug nomenclature and is the identifier system used by the majority of US EHR systems, pharmacy systems, and the FDA. Choosing RxCUI as the canonical identifier means every other system (NDC, ATC, brand name) is a lookup that resolves to RxCUI rather than a parallel primary key. This simplifies the interaction query to a single indexed column pair while keeping the resolver flexible.

### Class-level rules without pre-materialization

Storing class-level interactions as rules rather than pre-expanding them to all concrete pairs avoids a compounding maintenance problem. When a new drug is added to an existing class (e.g., a new NSAID gets an RxCUI), no migration is needed to cover its interactions with ACE inhibitors — the class rule already covers it. Pre-materialization would require either a re-expansion job on every new drug ingestion or accepting a window where the new drug is missing interactions its class implies.

---

## What Is Intentionally Out of Scope

The following concerns are explicitly excluded from the melo-rx architecture and will not be added:

- **PHI or patient data** — the API accepts only drug identifiers. No patient identifier, session, or health record is ever accepted, stored, or logged.
- **Clinical certification** — melo-rx documents its clinical review process but does not claim certification of individual interaction pairs as clinically validated for prescribing decisions.
- **CDSS functionality** — the system returns reference data with source citations. It does not generate prescribing recommendations, contraindication alerts framed as clinical conclusions, or dosing guidance.
- **Consumer or patient-facing UI** — melo-rx is a developer infrastructure tool. No patient-facing interface, health portal integration, or consumer product is planned.
- **Real-time label monitoring** — OpenFDA label ingestion runs on a scheduled batch cycle. Webhook-based real-time label change detection is listed as a post-v1.0 scalability trigger, not a core feature.
- **International identifier systems at v1.0** — dm+d (NHS), ATC-only lookups without RxCUI crosswalk, and non-US national formulary codes are not supported in v1.0. The architecture abstracts source adapters to enable this post-v1.0 without a core rewrite.
