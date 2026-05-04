# melo-rx — Project Summary

## Elevator Pitch

melo-rx is an Apache 2.0-licensed, self-hostable Drug-Drug Interaction (DDI) API and npm client that fills the infrastructure gap left by the NLM's shutdown of the RxNav DDI APIs on January 2, 2024.

---

## Problem Solved

The NLM decommissioned RxNav without announcing a replacement, leaving over 1,200 npm packages, open-source EHR projects, and commercial health applications without a production-grade DDI API. Teams defaulted to proprietary SaaS APIs costing $500–$5,000+/month, stale static lookup tables, or silently dropped interaction checks entirely. Every commercially viable alternative (DrugBank, SIDER) carries a CC BY-NC license that prohibits redistribution in downstream products, creating an irreconcilable conflict for open-source healthcare software.

---

## Who Uses It and How

- **App developers** — install `@melo-rx/client`, query a drug pair in under 5 minutes, ship a feature with zero recurring API cost and no license friction.
- **Clinical systems integrators** (EHR/pharmacy vendors) — pull the Docker image, deploy behind their own infrastructure, audit source citations and provenance docs, and POST to `/v1/interactions/batch` for polypharmacy checks.
- **Healthcare researchers** — download versioned dataset snapshots in CSV/JSON with full source citations under a publication-compatible Apache 2.0 license.
- **Clinical pharmacists** — contribute curated interaction pairs via a structured JSON template with CI schema validation, without needing deep GitHub familiarity.
- **Healthcare startups** — self-host to satisfy a "regulatory-compliant" requirement with zero API budget by relying on an actively maintained, Apache 2.0 dataset.

---

## Business Model

melo-rx is fully open-source under **Apache 2.0** (commercial use permitted, warranty disclaimed, patent grant included). There is no SaaS tier, no paid plan, and no authentication requirement for self-hosted deployments. A hosted demo API is provided for evaluation, rate-limited at 60 req/min unauthenticated. Infrastructure costs for the demo (~$27–55/month at modest scale) are covered by GitHub Sponsors or open-source fund contributions.

---

## Key Architectural Decisions

- **Modular monolith as a pnpm workspace** — `packages/core`, `packages/api`, `packages/cli`, and `packages/client` share types from a single source of truth; the pipeline and resolver live in separate top-level directories with clean boundaries.
- **Hono over Express or Fastify** — Hono runs unchanged on Node.js, Bun, Cloudflare Workers, and Deno; this keeps edge deployment as a zero-cost future option without carrying Express's type-unsafe middleware baggage.
- **PostgreSQL 16 over SQLite or MongoDB** — JSONB handles dynamic `sources[]` and `identifiers`; the relational model enforces class-inheritance integrity; pgvector is available as a future extension for semantic drug search.
- **Drizzle ORM over Prisma** — Drizzle outputs plain SQL, has zero runtime dependencies, and keeps migration files as readable `.sql` that DBAs can audit; Prisma's runtime engine adds ~200ms cold start and requires a separate binary.
- **Class-level interaction rules expand at query time** — the database stores `drug_class_interaction` rules; the query engine materializes concrete pairs dynamically to avoid stale combinatorial explosion.
- **Non-suppressible disclaimer middleware** — every response from `/v1/interactions*` includes a `disclaimer` field injected at the middleware layer; callers cannot opt out. This is a legal boundary, not a UX choice.

---

## Important Docs for New Engineers

- [`docs/project.md`](./project.md) — complete project definition: mission, architecture, data strategy, business rules, roadmap, and risk register.
- [`docs/architecture.md`](./architecture.md) — component diagram, monorepo layout, data flow walkthrough, and design decision rationale.
- [`docs/development/local-setup.md`](./development/local-setup.md) — prerequisites, Docker Compose quickstart, seeding the database, and running the test suite.

---

## Explicit Non-Goals

melo-rx is **not** any of the following:

- A Clinical Decision Support System (CDSS) — it does not make prescribing recommendations.
- A replacement for clinical pharmacist review — it provides reference data, not clinical determinations.
- A patient-facing application — it accepts drug identifiers only, never patient identifiers or PHI.
- A certified regulatory compliance tool — clinical review is documented but does not constitute certification of individual interaction pairs.
- A real-time drug label monitoring service — ingestion runs on a scheduled batch cycle, not on FDA label publication events.
- An international formulary system at launch — v1.0 is US-centric (RxCUI canonical, ONCHigh/NDF-RT/OpenFDA sources); international adapter support is planned post-v1.0.
- A support organization — there is no SLA, no enterprise support contract, and no warranty.
