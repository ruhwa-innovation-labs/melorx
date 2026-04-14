# melo-rx — Technology Stack Reference

## Full Stack Table

| Layer | Technology | Version | Purpose | Why Chosen | What Was Rejected |
|-------|-----------|---------|---------|------------|-------------------|
| Runtime | Node.js | 22+ (LTS) | JavaScript execution environment | Mature ecosystem for HTTP and NLP tooling; LTS lifecycle aligns with project support windows | Bun (immature LTS story at v0.1); Deno (incompatible npm ecosystem surface) |
| Language | TypeScript | 5.x | Static typing across all packages | Shared types between `packages/core`, `packages/api`, and `packages/client` eliminate runtime type drift; native ESM support | Go (strong for API, but splits the npm client into a separate language boundary); Python (excellent for NLP, but the NLP surface here is narrow enough that Natural.js suffices) |
| Package manager | pnpm | 9.x | Dependency management, monorepo workspaces | Fastest installs; disk-efficient symlink-based store; first-class workspace protocol for monorepos | npm (slower, no workspace protocol at same maturity); Yarn (Berry complexity overhead not needed here) |
| API framework | Hono | 4.x | HTTP routing, middleware, request/response handling | Edge-deployable unchanged on Node.js, Bun, Cloudflare Workers, and Deno; excellent TypeScript DX; no runtime engine overhead | Express (no first-class TypeScript; decades of unused middleware baggage); Fastify (viable but heavier DX for this scope); Elysia (Bun-first, Node support secondary) |
| Database | PostgreSQL | 16 | Primary data store for drug concepts, class rules, and interaction pairs | JSONB for dynamic `sources[]` and `identifiers`; row-level security for future multi-tenant isolation; pgvector extension available for semantic search; strong relational integrity for class-inheritance constraints | SQLite (not suitable for multi-connection server workloads; no RLS); MongoDB (relational integrity between three linked tables is a core correctness requirement; document model complicates UNIQUE pair constraints) |
| ORM / Migrations | Drizzle ORM | 0.x | Type-safe query building, schema management, migration files | Zero runtime dependencies; outputs plain SQL; migrations stored as human-readable `.sql` files; no separate binary required | Prisma (~200ms cold start from Rust query engine binary; non-standard migration workflow); TypeORM (decorator-based; type inference gaps); Kysely (viable query builder but lacks integrated migration story) |
| Schema validation | Zod | 3.x | Runtime input validation; TypeScript type inference from schemas | Single schema definition produces both runtime validator and TypeScript type; used in `packages/core` as the canonical type source for all packages | Yup (worse TypeScript inference); io-ts (verbose; unfamiliar to most contributors); Valibot (newer, smaller community at time of evaluation) |
| Testing | Vitest | 2.x | Unit and integration testing | Native ESM without a transform step; watch mode approximately 10x faster than Jest on a cold TypeScript monorepo; compatible with the same assertion syntax as Jest for low migration friction | Jest (requires Babel/ts-jest transform for ESM; slower cold start); Mocha (no built-in TypeScript support; requires separate assertion library) |
| NLP (label parsing) | Natural.js + regex heuristics | Natural 6.x | Extracting interaction data from FDA label free text | Interaction sections in FDA labels follow predictable sentence structures; a tuned regex pipeline achieves approximately 80%+ precision without API costs, a Python service boundary, or GPU infrastructure | spaCy (Python; introduces a separate process boundary and language runtime); LLM extraction (API cost per label at 10,000+ label scale; non-deterministic output requiring additional validation layer) |
| Containerization | Docker + docker-compose | Docker 25+ | Reproducible local and production deploys | Industry standard; cold-start target under 30 seconds; allows self-hosted operators to run with a single `docker compose up` | Podman (viable technically; lower adoption among target persona of app developers and EHR integrators) |
| CI/CD | GitHub Actions | N/A | Automated test gates, ingestion schedule, PR schema validation | Integrated with GitHub repository; free for public open-source repos; supports cron-based scheduled ingestion jobs | CircleCI, Jenkins (additional infrastructure or cost not justified for an open-source project) |
| Documentation | VitePress | 1.x | Documentation site | Fast Markdown-first static site; familiar to the Node/TypeScript developer audience; easy for contributors to edit | Docusaurus (heavier; React dependency for what is essentially static content); GitBook (hosted SaaS; not self-hostable) |

---

## Runtime and Language

**Node.js 22+** is the minimum supported runtime. The project will track the Node.js LTS release cycle (see Upgrade Policy below). TypeScript 5 is required for all packages; `strict` mode is enabled in all `tsconfig.json` files. The monorepo uses a shared base `tsconfig.base.json` in the root with package-level overrides.

---

## API Layer

The Hono application in `packages/api` is structured as:

- Route handlers registered per endpoint family (`/v1/drugs`, `/v1/interactions`, `/health`, `/metrics`)
- A disclaimer middleware applied to all routes matching `/v1/interactions*`
- A Zod validation middleware applied before all route handlers that touch query parameters or request bodies
- Drizzle ORM query functions called from route handlers — no raw SQL in route files

---

## Data Layer

Three primary tables in PostgreSQL 16:

- `drug_concept` — canonical drug records keyed by RxCUI, with `identifiers` JSONB storing NDC, ATC, brand names, and future identifiers
- `drug_class_interaction` — class-level interaction rules; the query engine expands these dynamically at query time
- `drug_interaction` — concrete pair interactions; `is_generated = true` marks class-expansion records; `confidence` is null for curated pairs and 0.0–1.0 for NLP-extracted pairs

Migration files live in `db/migrations/` as plain `.sql` files managed by Drizzle Kit. No migration is applied automatically at server startup — migrations are an explicit operational step.

---

## Validation and Types

All canonical types (severity enum, interaction response shape, drug concept shape, source citation shape) are defined as Zod schemas in `packages/core` and re-exported as inferred TypeScript types. No package defines its own independent types for shared domain objects — all imports come from `packages/core`. This is enforced by TypeScript project references.

---

## Testing

Vitest is configured at the monorepo root with workspace-level test configs per package. Test categories:

- **Unit tests** — resolver logic, severity mapping, Zod schema validators
- **Integration tests** — route handlers tested against a seeded in-process PostgreSQL instance (using `pg-mem` for fast runs, real Docker PostgreSQL for CI)
- **Pipeline tests** — ETL adapter output validated against the canonical schema before database insertion

The CI test gate on pull requests runs the full test suite. PRs that add community-contributed interactions must pass a schema validation test that verifies `sources[]` is non-empty and `severity` matches the canonical enum.

---

## NLP Pipeline

The OpenFDA label ingestion pipeline (`pipeline/sources/openfda/`) uses Natural.js for sentence tokenization and a regex heuristic layer to identify interaction claims in the `drug_interactions` section of FDA structured product labels. Each extracted pair receives a `confidence` score (0.0–1.0). Pairs scoring below 0.75 are inserted into a review queue and are not served in production responses until a maintainer or designated clinical reviewer approves them.

The NLP pipeline is not used for curated sources (ONCHigh, NDF-RT) — those are parsed via deterministic ETL adapters.

---

## Infrastructure

**docker-compose.yml** defines two services:

- `db` — PostgreSQL 16 with a named volume for persistence; environment variables for credentials
- `api` — the Hono API server, built from `packages/api`; depends on `db`; exposes port 3000

The hosted demo runs on Fly.io (or Railway) with a PostgreSQL instance and two stateless API containers. Estimated infrastructure cost at moderate scale: $27–55/month. S3-compatible object storage holds dataset snapshots and ingestion cache files.

---

## CI/CD

GitHub Actions workflows:

- **`test.yml`** — triggered on every PR; runs `pnpm install`, `pnpm test`, `pnpm audit`; blocks merge on failure
- **`ingest.yml`** — scheduled monthly; runs the ONCHigh, NDF-RT, and OpenFDA ingestion adapters against the production database; tags the resulting dataset snapshot with a date-versioned release
- **`validate-contribution.yml`** — triggered on PRs that modify `pipeline/sources/community/`; runs the schema validator, deduplication check, and source citation presence check

---

## Documentation

VitePress documentation site serves the public-facing API reference, data provenance guide, self-hosting instructions, and the contributor guide. The source lives in `docs/` and is deployed to a static host (Cloudflare Pages or GitHub Pages) on every merge to `main`.

---

## Data Sources

| Source | Version | DDI Pairs | Quality | License | Notes |
|--------|---------|-----------|---------|---------|-------|
| ONCHigh | v0.1 seed | 437 | Clinician-curated; highest confidence | Public domain (ONC / HHS) | First ingested; seeds the production database at v0.1 launch |
| NDF-RT (VA/NLM) | v0.2 | ~3,000 | Moderate; narrative-mapped to canonical severity | Public domain (US Government) | Broadens coverage; severity requires case-by-case canonical mapping |
| OpenFDA Drug Labels | v0.3 | 10,000+ drugs (NLP-extracted pairs) | NLP-extracted; confidence-scored; pairs below 0.75 held for human review | Public domain (FDA) | Long-tail coverage; all extracted pairs carry a `confidence` field |
| Community PRs | Ongoing | Incremental | Source-cited; clinical reviewer gate before merge | Apache 2.0 (contributor assignment) | Must include `source_type` from: `clinical_guideline`, `fda_label`, `peer_reviewed_study`, `clinical_pharmacist_review` |

### Hard Rule: License Compatibility

**Never ingest data from sources with non-commercial or share-alike licenses.**

The following sources are permanently excluded regardless of their DDI coverage:

| Source | License | Reason Excluded |
|--------|---------|-----------------|
| DrugBank | CC BY-NC 4.0 | Non-commercial clause; no redistribution in commercial downstream products |
| SIDER 4.1 | CC BY-NC 4.0 | Same; also frozen since 2015 |
| DDInter | Research-only | Prohibits commercial use and redistribution |

Ingesting any CC BY-NC or non-commercial-licensed data into the main dataset would infect the Apache 2.0 dataset license and make melo-rx unusable by commercial adopters. This rule is enforced at the maintainer review level and documented in the contributor guide. No automated check can fully substitute for maintainer awareness of this constraint.

---

## Upgrade and Maintenance Policy

### Node.js

melo-rx tracks the **Node.js LTS release cycle**. When a new LTS version enters Active LTS status (typically each October), the project upgrades within 60 days. When an LTS version reaches End of Life, it is removed from the supported matrix within 30 days. The minimum required Node.js version is declared in `package.json` under `engines.node` and enforced in CI.

### TypeScript

TypeScript minor versions are adopted on release. TypeScript major versions are evaluated within 30 days of release; adoption is gated on compatibility with the current Drizzle ORM and Hono versions. The `strict` compiler flag is permanent and is never loosened to accommodate third-party package type gaps.

### PostgreSQL

melo-rx targets the **current PostgreSQL major version** (16 at project inception). When a new PostgreSQL major version is released, migration is planned for within 6 months of its General Availability date. When the current target version reaches End of Life (5-year support cycle), the project upgrades before EOL. Major version upgrades are tested with a full ingestion pipeline run and integration test suite before the `docker-compose.yml` image pin is updated.

### Drizzle ORM

Drizzle minor and patch versions are adopted on release after a one-week observation window. Major versions require a migration test run against the full schema before adoption.

### Dependencies (General)

`pnpm audit` runs in CI on every PR. Any high-severity advisory causes the pipeline to fail and blocks merge. Moderate advisories generate a warning and are reviewed within 14 days. The `pnpm update` command is run monthly as part of the scheduled ingestion workflow to keep transitive dependencies current.

### Data Sources

ONCHigh, NDF-RT, and OpenFDA ingestion jobs run on a **monthly CI schedule**. Any changes to source data formats that break the ETL adapters are treated as high-priority issues. The dataset version is tracked as a date-versioned release tag in the repository; breaking changes to the canonical schema (adding or renaming enum values, changing the response envelope shape) are treated as minor version increments with a changelog entry.
