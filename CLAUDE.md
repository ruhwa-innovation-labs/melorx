# melorx

Open-source drug-drug interaction (DDI) API and dataset, built as a production-grade replacement for the NLM's decommissioned RxNav interaction endpoints. Licensed Apache 2.0 — commercially redistributable, self-hostable, and actively maintained.

---

## Package Manager

Always use **pnpm**. Never use npm or yarn. This is a pnpm workspace monorepo.

---

## Tech Stack Quick Reference

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ / TypeScript 5 |
| API Framework | Hono |
| Database | PostgreSQL 16 |
| ORM / Migrations | Drizzle ORM |
| Validation | Zod |
| Testing | Vitest |
| NLP | Natural.js + regex heuristics |
| Containerization | Docker + docker-compose |
| CI/CD | GitHub Actions |

---

## Architecture

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                           melorx                                │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Ingestion   │───▶│   PostgreSQL 16  │───▶│   REST API    │  │
│  │  Pipeline    │    │  (normalized     │    │  (Hono /      │  │
│  │  (ETL)       │    │   schema)        │    │   Fastify)    │  │
│  └──────────────┘    └──────────────────┘    └───────────────┘  │
│         │                     │                      │          │
│  ┌──────▼──────┐    ┌─────────▼────────┐    ┌───────▼───────┐  │
│  │  Source     │    │  Resolver        │    │  npm Package  │  │
│  │  Adapters   │    │  Service         │    │  @melorx/    │  │
│  │  ONCHigh    │    │  RxCUI ↔ NDC ↔   │    │  client       │  │
│  │  OpenFDA    │    │  ATC ↔ brand     │    │               │  │
│  │  NDF-RT     │    └──────────────────┘    └───────────────┘  │
│  └─────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
```

### Monorepo Layout

```
melorx/
├── packages/
│   ├── core/          # Schema types, Zod validators, shared utilities
│   ├── api/           # Hono REST API server
│   ├── cli/           # Dataset inspection + ingestion CLI
│   └── client/        # npm package (@melorx/client)
├── pipeline/
│   ├── sources/
│   │   ├── onc-high/  # ONCHigh ETL adapter
│   │   ├── openfda/   # OpenFDA bulk label adapter + NLP extractor
│   │   └── ndf-rt/    # NDF-RT VA adapter
│   └── resolver/      # Identifier normalization service
├── db/
│   └── migrations/    # Drizzle ORM migration files
├── docs/
└── docker-compose.yml
```

---

## Non-Negotiable Rules

1. **Always use pnpm.** No npm, no yarn — anywhere in the codebase, scripts, or CI.

2. **The disclaimer middleware is non-suppressible.** `packages/api/src/middleware/disclaimer.ts` injects a `disclaimer` field on all `/v1/interactions*` responses. This must never be removed, made conditional, or made optional by any caller parameter. It is a hard architectural constraint.

3. **Never ingest non-commercial-licensed data.** CC BY-NC, CC BY-NC-SA, and any non-commercial license (including SIDER, DrugBank, DDInter) must never be ingested into the main dataset. Mixing them would infect the Apache 2.0 license.

4. **Every `drug_interaction` row must have at least one entry in `sources[]`.** Empty `sources[]` is invalid. CI schema validation must reject it. This applies to all ingestion adapters and all community PRs.

5. **Severity must use `severity_enum` values only.** The valid values are: `contraindicated | serious | moderate | minor | monitor`. No free-text severity strings anywhere — not in the DB, not in API responses, not in ingestion adapters.

6. **NLP-extracted pairs with `confidence < 0.75` must not be served via the API.** These go into the review queue. The `confidence` field on `drug_interaction` is checked before any interaction is returned by the query engine.

7. **The API accepts only drug identifiers — never PHI.** Valid inputs: RxCUI, NDC, brand name. Patient names, dates of birth, patient IDs, or any other patient-identifying data must never touch the API surface, the logs, or the database.

8. **No `any` TypeScript type.** Use `unknown` combined with Zod parsing or explicit type guards. `any` bypasses the type safety that makes `packages/core` types trustworthy across the monorepo.

9. **Class-level interactions expand at query time — never pre-materialize.** `drug_class_interaction` rules are resolved to concrete pairs dynamically by the query engine. No pre-expansion into `drug_interaction` rows for class-derived pairs. Pre-materialization creates stale combinatorial state.

10. **melorx is an informational reference tool — not a clinical decision system.** Never use language in API responses, documentation, or code comments that implies clinical certification, legal compliance determination, prescribing authority, or replacement for clinical judgment. Response language presents documented facts, not clinical conclusions.

---

## Documentation Map

| If you need to know... | Read... |
|---|---|
| Project goals and personas | `docs/project.md` |
| System architecture | `docs/architecture.md` |
| Database schema | `docs/data/schema.md` |
| Entity relationships | `docs/data/entity-relationships.md` |
| API endpoints | `docs/api/overview.md` |
| RxNorm integration | `docs/api/rxnorm.md` |
| OpenFDA pipeline | `docs/api/openfda.md` |
| Local development setup | `docs/development/local-setup.md` |
| Environment variables | `docs/development/environment-variables.md` |
| Coding standards + review checklist | `docs/development/coding-standards.md` |
| Git workflow and commit style | `docs/development/git-workflow.md` |
| Testing approach | `docs/development/testing-strategy.md` |
| Security and legal positioning | `docs/security/overview.md` |
| Infrastructure and costs | `docs/operations/infrastructure.md` |
| CI/CD pipeline | `docs/operations/deployment-pipeline.md` |
| Monitoring and observability | `docs/operations/monitoring.md` |
| How to propose a new feature | `docs/plans/feature-spec-template.md` |
| How to record an architectural decision | `docs/plans/adr-template.md` |

---

## Key Files

| Path | Purpose |
|---|---|
| `packages/core/src/types/` | Shared TypeScript types and Zod schemas — source of truth for all data shapes across the monorepo |
| `packages/api/src/middleware/disclaimer.ts` | Non-suppressible disclaimer injection on all `/v1/interactions*` responses |
| `packages/api/src/routes/` | Hono route handlers for all API endpoints |
| `pipeline/resolver/` | Multi-identifier resolver — normalizes RxCUI, NDC, ATC, and brand name inputs to canonical RxCUI |
| `pipeline/sources/onc-high/` | ONCHigh ETL adapter — seeds the 437 clinician-curated pairs that form the v0.1 baseline |
| `pipeline/sources/openfda/` | OpenFDA bulk label downloader and NLP interaction extraction pipeline with confidence scoring |
| `db/migrations/` | Drizzle migration files — the authoritative source of truth for the database schema |
| `docker-compose.yml` | Local development and self-hosted deployment spec |
| `.env.example` | Environment variable template — all required vars must be documented here |
