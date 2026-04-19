# melo-rx: Drug-Drug Interaction API — Core-to-Shell Project Definition

> **Status:** Pre-development | **Version:** 0.0.1 | **Date:** 2026-04-14

---

## Layer 1: The Core (The "Why")

### Mission & Vision

**Mission:** Build and maintain the most accessible, accurate, and openly-licensed drug-drug
interaction (DDI) dataset and query API available — filling the critical gap left by the
decommissioning of RxNav.

**Vision:** Become the de facto open-source DDI infrastructure layer that powers healthcare
applications globally. Every developer building a medication-aware product should be able to
reach for `@melo-rx/client` the same way they reach for a date library — reliable, free,
and production-grade.

---

### The Problem

The NLM shut down RxNav's drug interaction APIs on **January 2, 2024**, with no announced
replacement. Approximately **1,200+ npm packages, open-source EHR projects, and commercial
health applications** relied on RxNav endpoints directly. The downstream effect: teams either
absorbed a proprietary API bill, regressed to static lookup tables, or silently dropped
interaction checks entirely. In a domain where a missed warfarin-fluconazole interaction can
cause a fatal bleed, "silently dropped" is not an acceptable failure mode.

The scale of the gap is significant. The FDA approves roughly **50–60 new molecular entities
per year**. The FAERS database receives **~2 million adverse event reports annually**, a
meaningful portion of which involve DDIs. Yet the open-source tooling ecosystem has no
maintained, production-grade DDI API to query. Every team rebuilds the same broken solution
from scratch.

**The existing alternatives are uniformly inadequate:**

| Alternative | Price | DDI Coverage | License | Key Limitation |
|-------------|-------|-------------|---------|----------------|
| DrugBank API | $500–$5,000+/month | ~1.5M pairs | CC BY-NC | No commercial redistribution; no self-hosting |
| Clinical Pharmacology | $3,000+/month | Comprehensive | Proprietary | SaaS-only; no API embedding in FOSS |
| SIDER 4.1 | Free | ~140k side effects, ~300 DDIs | CC BY-NC | Frozen since 2015; academic-only license |
| OpenFDA labels | Free | ~20k drugs | Public domain | Unstructured narrative text only — requires NLP |
| ONCHigh (standalone) | Free | 437 pairs | Public domain | Covers only the most dangerous pairs; no API layer |
| DIY static tables | Free | Varies (usually <500 pairs) | Varies | What most teams default to — brittle, unmaintained |

The result: healthcare software either ships without DDI checks, uses stale hardcoded tables,
or pays thousands per month for access they cannot redistribute in their own products.

---

### Unique Value Proposition (UVP)

| Dimension | melo-rx | Existing Alternatives |
|-----------|---------|----------------------|
| License | Apache 2.0 — commercial-friendly | CC BY-NC (DrugBank), proprietary, or frozen |
| Maintenance | Active pipeline + community PRs | Paywalled updates or abandonware |
| Identifier resolution | Multi-system resolver (RxCUI, NDC, ATC, brand name) | Single-identifier only |
| Drug class inheritance | Class-level rules expand to all concrete pairs | Flat pair tables |
| Deployment | Self-hosted REST API **and** npm package | SaaS-only |
| Data transparency | Full source citations per interaction record | Opaque black-box |
| Cost | Free (self-hosted) | $0–$10k+/month |

---

### Success Metrics

Open-source health infrastructure projects with clear value propositions and low friction to
adopt typically reach 500–1,000 GitHub stars within 12 months of a production-ready release —
driven by developer word-of-mouth and healthcare Slack/Discord communities. The targets below
are benchmarked against comparable open-source API projects (Faker.js, Zod, similar-sized
health utilities) and the specific characteristics of the healthcare developer ecosystem.

| Metric | Target (12 months post-v1.0) | Rationale |
|--------|------------------------------|-----------|
| DDI pairs covered | 5,000+ (v1.0 launch) | Concrete curated pairs + class-rule expansion from ONCHigh (14 rules → hundreds of concrete pairs at query time) + OpenFDA NLP long tail. NDF-RT removed — see [ADR-003](plans/adr-003-ndf-rt-pivot.md) |
| Hosted demo API uptime | 99.5% | Standard for developer-facing APIs; below 99% degrades developer trust before adoption |
| npm `@melo-rx/client` weekly downloads | 1,000+ | Conservative for a healthcare utility — comparable health npm packages (fhir.js, hl7parser) reach 500–2,000/wk within Year 1 |
| GitHub stars | 500+ | Achievable through HackerNews launch post + healthcare dev communities; used as social proof in downstream README |
| Community PRs merged | 20+ | Quality signal: at least 20 externally-contributed interactions with valid source citations |
| OpenFDA drug labels parsed | 10,000+ | Covers the majority of commercially available drugs in the US market |
| Clinical pharmacist sign-off | Completed before v1.0 | Non-negotiable — the repo cannot credibly claim "production-ready" without documented expert review |
| p99 API response time | < 20ms (self-hosted, warm) | Interaction checks occur in the hot path of prescribing workflows; >100ms creates UX friction |
| First successful query (Time to Value) | < 5 minutes from `pnpm add` | Developer experience benchmark — if it takes longer than a coffee break, adoption stalls |

---

## Layer 2: The Logic (The "In")

### System Architecture

**Pattern:** Modular monolith organized as a pnpm workspace, with clean boundaries between
the data pipeline, the query engine, and the delivery surface.

```
┌──────────────────────────────────────────────────────────────────┐
│                           melo-rx                                │
│                                                                  │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Ingestion   │───▶│   PostgreSQL 16  │───▶│   REST API    │  │
│  │  Pipeline    │    │  (normalized     │    │  (Hono /      │  │
│  │  (ETL)       │    │   schema)        │    │   Fastify)    │  │
│  └──────────────┘    └──────────────────┘    └───────────────┘  │
│         │                     │                      │          │
│  ┌──────▼──────┐    ┌─────────▼────────┐    ┌───────▼───────┐  │
│  │  Source     │    │  Resolver        │    │  npm Package  │  │
│  │  Adapters   │    │  Service         │    │  @melo-rx/    │  │
│  │  ONCHigh    │    │  RxCUI ↔ NDC ↔   │    │  client       │  │
│  │  OpenFDA    │    │  ATC ↔ brand     │    │               │  │
│  └─────────────┘    └──────────────────┘    └───────────────┘  │
│                                                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Monorepo layout:**
```
melo-rx/
├── packages/
│   ├── core/          # Schema types, Zod validators, shared utilities
│   ├── api/           # Hono REST API server
│   ├── cli/           # Dataset inspection + ingestion CLI
│   └── client/        # npm package (@melo-rx/client)
├── pipeline/
│   ├── sources/
│   │   ├── onc-high/  # ONCHigh ETL adapter (curated pairs + class rules)
│   │   └── openfda/   # OpenFDA bulk label adapter + NLP extractor (v0.3)
│   └── resolver/      # Identifier normalization service (RxCUI / NDC / brand / ATC)
├── db/
│   └── migrations/    # Drizzle ORM migration files
├── docs/
│   └── project.md     # This file
└── docker-compose.yml
```

---

### Technical Stack

**Framework evaluation summary** — alternatives considered and why they were set aside:

| Layer | Chosen | Rejected | Deciding Factor |
|-------|--------|----------|-----------------|
| API Framework | **Hono** | Express, Fastify, Elysia | Hono runs on Node, Bun, Cloudflare Workers, and Deno unchanged — future edge deployment costs nothing extra; Express carries decades of middleware baggage with no type safety |
| Database | **PostgreSQL 16** | SQLite, MongoDB, PlanetScale | JSONB covers dynamic `sources[]` and `identifiers`; RLS handles multi-tenant isolation; pgvector extension (future) enables embedding-based semantic search — all in one engine |
| ORM | **Drizzle ORM** | Prisma, TypeORM, Kysely | Prisma's runtime engine adds ~200ms cold start and requires a separate migration binary; Drizzle outputs raw SQL, is zero-dependency at runtime, and keeps migrations in plain `.sql` files that DBAs can read |
| Language | **TypeScript 5** | Go, Python | Both the npm client and the API share types from `packages/core`; Python is the NLP-first choice but the NLP surface here is narrow enough that Natural.js suffices |
| Testing | **Vitest** | Jest, Mocha | Native ESM without transform step; watch mode is ~10× faster than Jest on a cold TypeScript monorepo |
| NLP | **Natural.js + regex** | spaCy (Python), LLM extraction | Interaction sections in FDA labels follow predictable sentence structures; a fine-tuned regex pipeline achieves ~80%+ precision without API costs or a Python service boundary |

**Full stack:**

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js 22+ / TypeScript 5 | Strong ecosystem for HTTP + NLP tooling |
| API Framework | Hono | Lightweight, edge-deployable, excellent TypeScript DX |
| Database | PostgreSQL 16 | JSONB for sources[], robust relational model for class inheritance |
| ORM / Migrations | Drizzle ORM | Type-safe, close to raw SQL, clean migration story |
| Package manager | **pnpm** (workspaces) | Fast, disk-efficient, monorepo support |
| Schema validation | Zod | Runtime validation + inferred TypeScript types |
| Testing | Vitest | Fast, native ESM, first-class TypeScript |
| NLP (label parsing) | Natural.js + regex heuristics | Sentence-level extraction from OpenFDA interaction sections |
| Containerization | Docker + docker-compose | Reproducible local + production deploys |
| CI/CD | GitHub Actions | Automated ingestion schedule + test gate on PRs |
| Docs | VitePress | Fast, Markdown-first, easy contribution |

---

### Data Strategy

#### Canonical Schema

```sql
-- Severity enum (canonical across all sources)
CREATE TYPE severity_enum AS ENUM (
  'contraindicated',  -- Never co-administer
  'serious',          -- Avoid unless benefit outweighs risk
  'moderate',         -- Use with caution + monitoring
  'minor',            -- Minimal clinical significance
  'monitor'           -- Theoretical / monitor only
);

-- Canonical drug concepts
CREATE TABLE drug_concept (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxcui       VARCHAR UNIQUE NOT NULL,
  name        VARCHAR NOT NULL,
  drug_class  VARCHAR[],           -- e.g. ['NSAID', 'COX-2 inhibitor']
  identifiers JSONB NOT NULL DEFAULT '{}'
  -- identifiers: { ndc: string[], atc: string, drugbank: string, brand_names: string[] }
);

-- Class-level interaction rules (generate concrete pairs)
CREATE TABLE drug_class_interaction (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_a     VARCHAR NOT NULL,
  class_b     VARCHAR NOT NULL,
  severity    severity_enum NOT NULL,
  mechanism   TEXT,
  management  TEXT,
  sources     JSONB[] NOT NULL DEFAULT '{}'
  -- sources[]: [{ name, url, type, accessed_date }]
);

-- Concrete pair interactions
CREATE TABLE drug_interaction (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug1_rxcui     VARCHAR NOT NULL REFERENCES drug_concept(rxcui),
  drug2_rxcui     VARCHAR NOT NULL REFERENCES drug_concept(rxcui),
  severity        severity_enum NOT NULL,
  mechanism       TEXT,
  management      TEXT,
  sources         JSONB[] NOT NULL DEFAULT '{}',
  class_rule_id   UUID REFERENCES drug_class_interaction(id),  -- NULL = direct pair
  is_generated    BOOLEAN DEFAULT FALSE,   -- TRUE = expanded from class rule
  confidence      NUMERIC(3,2),            -- NULL = curated; 0.0–1.0 = NLP-extracted
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT drug_pair_unique UNIQUE (drug1_rxcui, drug2_rxcui)
);
```

#### Data Source Priority & Ingestion Order

| Phase | Source | Pairs | Quality | License | Action |
|-------|--------|-------|---------|---------|--------|
| v0.1 | **ONCHigh (curated pairs)** | 5 | Clinician-curated | Public domain | Seed database |
| v0.2 | **ONCHigh class-rule expansion** | hundreds (class-expanded) | Clinician-curated rules | Public domain | Broaden coverage at query time |
| v0.3 | **OpenFDA Labels** | ~10,000+ | NLP-extracted | Public domain | Long tail |
| ongoing | **Community PRs** | incremental | Source-cited | Apache 2.0 | Continuous |

> **NDF-RT removed from roadmap.** Originally planned as the v0.2 broadening source, NDF-RT is absent from the current RxNorm release (NLM deprecated it in 2018 and shut the RxNav interaction API in 2024). Its role is split between ONCHigh class-rule expansion (v0.2) and OpenFDA NLP (v0.3). See `docs/plans/adr-003-ndf-rt-pivot.md`.

> **Never ingest:** SIDER (CC BY-NC), DrugBank (CC BY-NC), DDInter (research-only).
> Mixing non-commercial-licensed data would infect the dataset license.

#### Severity Canonical Mapping

| Source | Source Value | Canonical Value |
|--------|-------------|----------------|
| ONCHigh | `contraindicated` | `contraindicated` |
| ONCHigh | `serious` | `serious` |
| ONCHigh | `significant` | `moderate` |
| ONCHigh | `monitor` | `monitor` |
| DrugBank | `major` | `serious` _(if ever permitted)_ |
| DrugBank | `moderate` | `moderate` |
| DrugBank | `minor` | `minor` |
| OpenFDA NLP | free text | confidence-scored → human review |

---

### Business Rules

1. **Identifier resolution is mandatory.** All drug lookups pass through the Resolver Service
   before reaching the interaction table. Raw brand names, NDCs, and ATC codes are valid input.

2. **Class-level interactions expand at query time.** The database stores class rules; the
   query engine expands them to concrete pairs dynamically. No pre-materialization of class
   expansions (avoids stale combinatorial explosion).

3. **Every interaction requires at least one source citation.** Entries with empty `sources[]`
   are rejected by CI schema validation. This is enforced on community PRs.

4. **Severity must use the canonical enum.** No free-text severity values in the database.
   All ingestion adapters must map source-specific values to the enum before insertion.

5. **The API disclaimer is non-negotiable.** Every response from the `/v1/interactions`
   family of endpoints includes a `disclaimer` field. This is injected in middleware and
   cannot be suppressed by the caller.

6. **Community contributions require source type declaration.** PR JSON format must include:
   `source_type` ∈ `[clinical_guideline, fda_label, peer_reviewed_study, clinical_pharmacist_review]`.

7. **NLP-extracted pairs are confidence-scored and flagged.** OpenFDA-derived interactions
   carry a `confidence` score (0.0–1.0). Pairs below `0.75` confidence require manual review
   before serving in production.

---

## Layer 3: The Shell (The "Out")

### User Personas

**App Developer** is the primary acquisition persona — the person who hits the npm search bar
or googles "drug interaction API open source" after discovering that their current solution
(usually a static object literal or a soon-to-be-paywalled SaaS) has let them down. They need
a working query in under 5 minutes, TypeScript types without any ceremony, and zero ongoing
API bill to explain to their manager. Their acute frustration is that every existing solution
either costs money they don't have, returns data they can't redistribute, or stopped being
maintained years ago. They decide to adopt based on README quality, a working code example, and
a quick scan of the GitHub stars.

**Clinical Systems Integrator** at an EHR or pharmacy management vendor needs melo-rx to pass
an internal security and compliance review. They care deeply about data provenance — where each
interaction record came from, who validated it, and when it was last updated. They will read the
source citation audit trail before any other feature. Their blocker is usually procurement: the
lack of a commercial entity behind melo-rx creates friction. The mitigation is a clear NOTICE
file, Apache 2.0 license with patent grant, documented clinical review, and Prometheus-compatible
observability out of the box.

**Healthcare Researcher** in pharmacovigilance or an academic DDI study needs the full dataset,
not just a query API. They want a flat export (CSV or JSON) with all source citations intact,
a license that allows publication without attribution headaches, and reproducible versioning so
their paper can reference a specific dataset snapshot. They are often the ones who file the most
substantive community PRs — adding interactions from peer-reviewed literature that the ingestion
pipeline missed.

**Clinical Pharmacist** is the highest-trust contributor and the rarest. They know the clinical
literature well enough to evaluate whether a proposed interaction is supported by evidence. Their
bottleneck is friction: they are not GitHub-native and will contribute exactly once if the PR
process is painful. A simple JSON contribution template with a schema validator, clear instructions,
and a fast review SLA converts a one-time contributor into a recurring collaborator.

**Healthcare Startup** building an MVP telehealth or medication management product has the most
acute cost sensitivity. Their investor deck says "regulatory-compliant" but their runway says
"don't pay for an API." Apache 2.0 + self-hosting is the answer they're looking for. Their
secondary concern is that the dataset not rot: if they ship a feature powered by melo-rx, they
need confidence the underlying data will still be accurate in 18 months.

| Persona | Primary Goal | Key Concern | Conversion Trigger |
|---------|-------------|-------------|-------------------|
| App Developer | Working query in < 5 min | License + maintenance status | README code example + stars |
| Clinical Systems Integrator | Self-hosted, auditable API | Data provenance + security review | Source citations + NOTICE file |
| Healthcare Researcher | Full dataset export | License for publication | Apache 2.0 + versioned snapshots |
| Clinical Pharmacist | Easy contribution path | PR friction | Simple JSON template + fast review |
| Healthcare Startup | Free, maintained, redistributable | Dataset longevity | Apache 2.0 + CI ingestion pipeline |

---

### User Journey

#### App Developer (primary)
```
1. Discovers melo-rx via npm search or GitHub
2. pnpm add @melo-rx/client
3. Reads README — sees a 5-line usage example
4. const result = await checkInteraction('lisinopril', 'ibuprofen')
5. Receives structured response: severity, mechanism, management, disclaimer
6. Ships feature — zero recurring cost, no API key needed (self-hosted)
```

#### Clinical Systems Integrator
```
1. Evaluates via hosted demo API (rate-limited public endpoint)
2. Reviews data provenance docs + source citation audit trail
3. Pulls Docker image: docker pull melo-rx/api:1.0.0
4. Deploys to internal infrastructure via docker-compose or Helm
5. Configures EHR to POST /v1/interactions/batch for polypharmacy checks
6. Monitors via /health and /metrics (Prometheus-compatible)
```

#### Data Contributor (clinical pharmacist or researcher)
```
1. Opens a GitHub issue: "Missing interaction: warfarin + fluconazole"
2. Forks the repo, adds entry to pipeline/sources/community/
3. JSON contribution format enforces: drug1, drug2, severity, mechanism, sources[]
4. CI validates schema + deduplication check (no duplicate pairs)
5. Maintainer (or designated clinical reviewer) approves and merges
6. Interaction appears in next release (tagged, changelogs)
```

---

### API Surface

```
# Identifier resolution
GET  /v1/drugs/resolve?q=ibuprofen
GET  /v1/drugs/resolve?q=0005-0118              # NDC lookup
GET  /v1/drugs/:rxcui                           # Drug concept detail

# Interaction queries
GET  /v1/interactions?drug1=:rxcui&drug2=:rxcui # Single pair check
POST /v1/interactions/batch                     # Body: [{drug1, drug2}]
GET  /v1/drugs/:rxcui/interactions              # All interactions for a drug

# Dataset metadata
GET  /v1/drugs/classes                          # All known drug classes
GET  /v1/meta/stats                             # Dataset size, last updated

# Operations
GET  /health
GET  /metrics                                   # Prometheus format
```

**Standard response envelope:**
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
          { "name": "ONCHigh", "type": "clinical_guideline", "url": "...", "accessed": "2025-01-01" }
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

---

### Integration Ecosystem

| External System | Integration Method | Phase |
|----------------|-------------------|-------|
| RxNorm / NLM API | RxCUI identifier resolution (live + cached) | v0.1 |
| OpenFDA Bulk Download | Drug label ingestion pipeline | v0.3 |
| Docker Hub | Official image `melo-rx/api` | v1.0 |
| npm Registry | `@melo-rx/client` package | v0.3 |
| FHIR R4 | `MedicationKnowledge/$drug-interactions` endpoint | Post-v1.0 |
| EHR/EMR (Epic, Cerner) | REST API + potential HL7 FHIR adapter | Post-v1.0 |
| Prometheus / Grafana | `/metrics` endpoint for operational monitoring | v1.0 |

---

### Legal Positioning — "Informational Tool," Not Clinical Advisor

This distinction is not boilerplate — it is the most consequential architectural decision the
project will make. The specific failure mode to avoid: a returned "no interaction found" that
leads to a preventable adverse drug event, with the project cited as the proximate cause. The
safest and legally defensible framing is as a **"drug interaction reference and documentation
tool"** — helping developers surface interaction data for informational display, not making
clinical determinations.

Concretely, this means:
- Every API response **must** include a `disclaimer` field; the middleware enforces this and
  it cannot be suppressed by the caller.
- The README, npm package description, and documentation site must all carry a prominent
  `NOT FOR CLINICAL DECISION-MAKING` notice — not buried in ToS, but above the fold.
- Response language should present facts: `"A moderate interaction has been documented..."`,
  not conclusions: `"These drugs must not be co-administered."` The latter approaches
  clinical advice; the former provides reference data.
- The project should never describe itself as a replacement for a clinical pharmacist review,
  a CDSS (Clinical Decision Support System), or a prescribing authority.

Comparators in the reference-data space (e.g., Drugs.com, Medscape Interaction Checker) handle
this through clear "for informational purposes" framing and by prominently directing users to
consult healthcare professionals. melo-rx should follow this pattern explicitly.

### Security & Compliance

| Concern | Approach |
|---------|----------|
| **No PHI ever touches the API** | Accepts only drug identifiers (RxCUI, NDC, name) — never patient identifiers |
| **Rate limiting** | 60 req/min unauthenticated; 1,000 req/min with API key (hosted demo only) |
| **License** | Apache 2.0 — commercial use permitted, warranty and liability disclaimed |
| **Clinical disclaimer** | Injected via middleware on all `/v1/interactions*` responses; non-suppressible |
| **Data integrity** | SHA-256 checksums verified on each ingestion source download |
| **Dependency audit** | `pnpm audit` runs in CI — pipeline fails on high-severity advisories |
| **No PII in logs** | Request logs contain only drug IDs and response codes — no user/patient data |
| **Pre-v1.0 clinical review** | Licensed clinical pharmacist reviews ONCHigh dataset implementation; documented in repo |
| **Input validation** | All API inputs validated with Zod before any database query |

---

## Layer 4: The Horizon (The "Future")

### Scalability Path

**Infrastructure cost projection** — the hosted demo is not a commercial product, but it needs
to remain affordable to operate. At estimated usage of 500 developers × 200 queries/day = 100k
req/day, infrastructure costs are modest:

| Component | Estimated Cost (modest scale) | Notes |
|-----------|------------------------------|-------|
| PostgreSQL (Fly.io Postgres) | ~$15–30/month | Single instance; scales to $100+ with read replicas |
| API compute (Fly.io 2× 256MB) | ~$10–20/month | Stateless; auto-scales to zero off-hours |
| S3 / object storage | ~$2–5/month | Dataset snapshots + ingestion cache only |
| CDN (Cloudflare free tier) | $0 | Covers static docs + cached API responses |
| **Total (demo)** | **~$27–55/month** | Well within GitHub Sponsors or OSS fund coverage |

Self-hosted operators pay their own infra bill; the project's obligation is a lean Docker image
and a `docker-compose.yml` that cold-starts in under 30 seconds.

| Trigger | Response |
|---------|----------|
| 10× query volume | Read replicas on PostgreSQL; Redis cache for hot drug pairs (LRU, 1hr TTL) |
| 10× dataset size | Materialized views for class expansion; partition `drug_interaction` by severity |
| Multi-region deployment | Stateless API containers behind CDN; read-only replicas per region |
| FHIR mandate in target market | Add FHIR R4 `MedicationKnowledge` endpoint wrapper |
| Enterprise SLA requirement | Helm chart for Kubernetes; optional commercial support tier via GitHub Sponsors |
| Real-time label monitoring | Webhook subscriptions to OpenFDA for newly approved drugs / label updates |

---

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Dataset staleness** | High | Critical | Automated monthly ingestion CI job + public changelog |
| **Liability exposure** | Medium | High | Apache 2.0 disclaimer + clinical pharmacist sign-off on v1.0 |
| **RxCUI identifier drift** (retired CUIs) | Medium | High | Version-pin RxNorm snapshots; resolver handles deprecated CUI chains |
| **Community contribution quality** | Medium | Medium | CI schema validation + mandatory `sources[]` + clinical reviewer gate |
| **OpenFDA NLP parsing inaccuracy** | High | Medium | Confidence scores on all NLP pairs; pairs below 0.75 held for human review |
| **Bus factor (solo maintainer)** | High | High | Contributor guide, governance doc, and co-maintainer invite at v0.3 |
| **License contamination** | Low | Critical | Hard block: never ingest CC BY-NC or non-commercial data into main dataset |
| **Regulatory misuse** | Low | High | Prominent `NOT FOR CLINICAL USE` disclaimer in README, API, npm, and docs |

---

### MVP Feature Prioritization (MoSCoW)

**Must-have (launch requirements — nothing ships without these):**
- Guided query API: resolve drug name/NDC → RxCUI → return interactions with severity + mechanism + management
- ONCHigh 437 pairs seeded and queryable
- Source citations on every returned interaction
- Non-suppressible `disclaimer` field on every response
- Docker Compose for self-hosted deployment
- `@melo-rx/client` npm package with TypeScript types
- README with a working 5-line code example

**Should-have (v0.2–v0.3, fast-follow):**
- Identifier resolver (NDC ↔ brand name ↔ RxCUI)
- Drug class inheritance (NSAID + ACE inhibitor expands at query time)
- Batch interaction check endpoint
- Vitest integration test suite with seeded DB
- Community contribution JSON format + PR template + CI validation

**Could-have (v0.3–v1.0):**
- OpenFDA NLP ingestion pipeline + confidence scoring
- VitePress documentation site
- FHIR R4 response format option
- Prometheus `/metrics` endpoint

**Explicitly excluded from v1.0:**
- Clinical compliance certification or legal sign-off on individual interaction pairs
- Support for international drug identifiers (ATC-only, non-US NDC systems)
- Real-time OpenFDA label change detection (scheduled batch only)
- Patient-facing features or consumer UI of any kind

---

### Phase 1 Roadmap

#### v0.1 — Foundation _(Weeks 1–3)_
- [ ] Initialize pnpm monorepo (`packages/core`, `packages/api`, `packages/cli`)
- [ ] PostgreSQL schema + Drizzle ORM migrations
- [ ] ONCHigh XML ETL adapter → seed 437 interaction pairs
- [ ] REST API: `GET /v1/interactions?drug1=&drug2=` + `GET /v1/drugs/resolve`
- [ ] Docker Compose for local development
- [ ] README with quickstart (5 lines to running query)

#### v0.2 — Resolver + Class Inheritance _(Weeks 4–6)_
- [x] Identifier resolver: RxCUI ↔ NDC ↔ brand name via RxNorm local ingest (RXNCONSO / RXNSAT / RXNREL)
- [x] `drug_class_interaction` schema + class-expansion query logic (ONCHigh rules)
- [ ] `POST /v1/interactions/batch` endpoint
- [ ] Vitest test suite: unit tests for resolver + integration tests against seeded DB
- ~~NDF-RT VA ingestion adapter~~ — removed per [ADR-003](plans/adr-003-ndf-rt-pivot.md); breadth split between ONCHigh class expansion (v0.2) and OpenFDA NLP (v0.3)

#### v0.3 — Long Tail + Community _(Weeks 7–10)_
- [ ] OpenFDA bulk label download + NLP interaction extraction pipeline
- [ ] Confidence scoring on NLP-extracted pairs; review queue for `< 0.75`
- [ ] Community contribution JSON format + PR template + CI validation
- [ ] `@melo-rx/client` npm package with TypeScript types
- [ ] Hosted demo deployment (Fly.io or Railway) with rate limiting

#### v1.0 — Production-Ready _(Weeks 11–16)_
- [ ] Clinical pharmacist review of full dataset — findings documented and resolved
- [ ] FHIR R4 response format option (opt-in via `Accept: application/fhir+json`)
- [ ] Prometheus `/metrics` endpoint + `/health` liveness probe
- [ ] Security audit: `pnpm audit` + manual input-validation review
- [ ] VitePress documentation site with API reference + data provenance guide
- [ ] v1.0 release with full changelog, NOTICE file, and Apache 2.0 LICENSE

---

### Global Expansion Path

The product architecture should abstract drug identifier systems and data sources into
configurable adapters from day one. US-centric choices (RxCUI as canonical identifier,
ONCHigh as seed data) are correct for v1.0 but should not be load-bearing assumptions
baked into the query engine.

Three international expansion opportunities exist once the US dataset reaches maturity:

**WHO Essential Medicines & International DDI Standards.** The WHO's Model List of Essential
Medicines covers ~500 core drugs used across 190+ countries. A `who_essential` flag on
`drug_concept` records, combined with ATC code support already in the identifier resolver,
would make melo-rx queryable by international teams without a full adapter rebuild. The
WHO Collaborating Centre for Drug Statistics Methodology publishes ATC classification
updates annually — an ingestible, public-domain source.

**EU/EMA standards.** The European Medicines Agency maintains the EUDRA Vigilance database
of adverse drug reactions and the EU Clinical Trials Register. EudraVigilance's open-access
API provides individual case safety reports with DDI-relevant data. European markets use
ATC codes as the primary identifier, which the resolver already handles as a secondary
lookup. A dedicated EMA adapter in `pipeline/sources/eudra/` would unlock ~440M EU patients'
worth of market relevance without changing the core schema.

**NHS / UK medicines.** The NHS OpenPrescribing dataset and the MHRA's Yellow Card scheme
are public-domain sources with UK-specific DDI reporting. The NHS Dictionary of Medicines and
Devices (dm+d) uses a SNOMED-CT-based identifier system, requiring a dm+d ↔ RxCUI crosswalk
for the resolver — significant but well-documented mapping work.

The long-term strategic position: melo-rx becomes the **"RxNorm for DDI data"** — the
identifier-agnostic, jurisdiction-aware open standard that any drug information system can
query regardless of whether it speaks RxCUI, ATC, dm+d, or a national formulary code.

---

## Appendix: Key Design Decisions

| Decision | Chosen | Rejected | Reason |
|----------|--------|----------|--------|
| API framework | Hono | Express | Edge-deployable, better TypeScript DX |
| ORM | Drizzle | Prisma, TypeORM | Closer to SQL, lighter runtime, better migration control |
| DB | PostgreSQL | SQLite, MongoDB | JSONB flexibility + relational integrity for class rules |
| Data license | Apache 2.0 | MIT | Patent grant clause relevant for healthcare software |
| Phase 1 data source | ONCHigh | DrugBank, SIDER | Only public domain + clinician-curated option |
| Identifier canon | RxCUI | NDC, ATC | RxNorm is the US standard; others resolved to it |
| npm package scope | `@melo-rx/client` | `melo-rx` | Scoped packages signal organizational ownership + future packages |

---

## Conclusion

This project sits at the intersection of a real infrastructure gap, a clear technical path,
and a competitive vacuum that no funded company is moving to fill. The NLM's January 2024
shutdown of RxNav left ~1,200+ healthcare applications without a production-grade DDI API.
The open-source alternatives are either frozen, non-commercially-licensed, or unstructured
text requiring NLP to become useful. The commercial alternatives cost $500–$5,000+/month
and cannot be redistributed.

The technical architecture resolves the project's central tension: the data is hard, the
software is not. ONCHigh seeds 437 clinician-curated pairs on day one; the normalized schema,
class-inheritance query engine, and identifier resolver are engineering problems with clear
solutions. The difficult work is the maintenance pipeline — automated ingestion, confidence
scoring, clinical review gates — which this spec addresses explicitly and which most
previous attempts have ignored.

The single most important product decision is **positioning as a reference tool, not a
clinical decision system.** Every architectural choice — the non-suppressible disclaimer
middleware, the `confidence` field on NLP-extracted pairs, the mandatory `sources[]` on every
interaction, the "borderline" flagging on ambiguous readings — reinforces this boundary.
Done correctly, melo-rx protects developers from accidental over-reliance while being
genuinely useful for the informational display cases that make up the vast majority of
real-world queries.

The configurable adapter architecture enables international expansion without rebuilding
the core. ATC code support in the resolver, WHO essential medicines flagging, and future
EudraVigilance and NHS dm+d adapters position the project to become the identifier-agnostic
DDI infrastructure layer for the global healthcare developer ecosystem — not just a US
RxNav replacement, but the open standard the RxNav gap made necessary.
