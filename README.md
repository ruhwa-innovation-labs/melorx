# melorx

**Open-source drug-drug interaction (DDI) API.** A maintained, Apache 2.0-licensed replacement for the NLM RxNav DDI service (decommissioned January 2024).

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@melorx/client)](https://www.npmjs.com/package/@melorx/client)
[![Status](https://img.shields.io/badge/status-pre--development-orange)]()

> **Disclaimer:** melorx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.

---

## The problem

RxNav's DDI APIs were shut down with no open-source replacement. Developers building medication-aware products are left choosing between:

- Proprietary APIs at $500–$5,000+/month that cannot be redistributed
- Datasets frozen since 2015 under non-commercial licenses
- DIY static lookup tables that rot within 18 months

melorx fills that gap: a normalized DDI dataset seeded from clinician-curated public-domain sources, exposed as a self-hostable REST API and npm package under Apache 2.0.

---

## Quick start

```bash
pnpm add @melorx/client
```

```ts
import { createClient } from '@melorx/client'

const client = createClient({ baseUrl: 'https://demo.melorx.dev' })

const result = await client.checkInteraction('lisinopril', 'ibuprofen')
console.log(result.interactions[0].severity)   // "moderate"
console.log(result.disclaimer)                 // always present
```

---

## Self-hosting

### From the published Docker image (recommended)

```bash
docker pull ghcr.io/ruhwa-innovation-labs/melorx:latest
```

A ready-to-run `docker-compose.prod.yml` plus Caddy / systemd / Nginx
snippets and backup + upgrade runbooks live in
[**docs/operations/self-hosted-deployment.md**](docs/operations/self-hosted-deployment.md).

### From source (development)

```bash
git clone https://github.com/ruhwa-innovation-labs/melorx.git
cd melorx
cp .env.example .env          # set DATABASE_URL
docker compose up -d          # starts PostgreSQL
pnpm install
pnpm db:migrate
pnpm db:seed                  # loads the ONCHigh curated pairs
pnpm dev
```

Verify: `curl http://localhost:3000/health`

Full developer setup guide: [docs/development/local-setup.md](docs/development/local-setup.md).

---

## API

| Endpoint | Description |
|----------|-------------|
| `GET /v1/drugs/resolve?q=ibuprofen` | Resolve name or NDC → RxCUI |
| `GET /v1/interactions?drug1=:rxcui&drug2=:rxcui` | Check a drug pair |
| `POST /v1/interactions/batch` | Check multiple pairs |
| `GET /v1/drugs/:rxcui/interactions` | All interactions for a drug |
| `GET /v1/meta/stats` | Dataset coverage stats |
| `GET /health` | Liveness probe |
| `GET /metrics` | Prometheus metrics |

Every response from `/v1/interactions*` includes a non-suppressible `disclaimer` field. This is enforced in middleware and is not optional.

Full API reference: [docs/api/overview.md](docs/api/overview.md)

---

## Data sources

| Source | Pairs | License | Status |
|--------|-------|---------|--------|
| ONCHigh (NLM) | 437 | Public domain | v0.1 seed |
| NDF-RT (VA/NLM) | ~3,000 | Public domain | v0.2 |
| OpenFDA labels | ~10,000+ | Public domain | v0.3 |
| Community PRs | incremental | Apache 2.0 | ongoing |

**License boundary:** melorx will never ingest CC BY-NC, CC BY-NC-SA, or any non-commercial-licensed data. Mixing such sources would contaminate the dataset license and break every downstream project that relies on it.

---

## Contributing

Contributions are welcome — especially:
- New interaction pairs with source citations
- Corrections to existing severity or mechanism descriptions
- Ingestion adapter improvements

**For data contributions:** copy the JSON template from [pipeline/sources/community/](pipeline/sources/community/), fill in all required fields (`drug1`, `drug2`, `severity`, `mechanism`, `sources[]`), and open a PR. CI validates the schema and checks for duplicates automatically. Every contribution requires at least one source citation with `source_type` ∈ `[clinical_guideline, fda_label, peer_reviewed_study, clinical_pharmacist_review]`.

**For code contributions:** read [docs/development/coding-standards.md](docs/development/coding-standards.md) and [docs/development/git-workflow.md](docs/development/git-workflow.md) before opening a PR.

Contribution template: [docs/plans/feature-spec-template.md](docs/plans/feature-spec-template.md)

---

## Stack

Node.js 22+ / TypeScript 5 — Hono — PostgreSQL 16 — Drizzle ORM — pnpm workspaces

Full rationale: [docs/tech-stack.md](docs/tech-stack.md)

---

## Documentation

| Need | Document |
|------|----------|
| Architecture and design decisions | [docs/architecture.md](docs/architecture.md) |
| Database schema | [docs/data/schema.md](docs/data/schema.md) |
| Local development | [docs/development/local-setup.md](docs/development/local-setup.md) |
| Environment variables | [docs/development/environment-variables.md](docs/development/environment-variables.md) |
| Security and legal positioning | [docs/security/overview.md](docs/security/overview.md) |
| Infrastructure and costs | [docs/operations/infrastructure.md](docs/operations/infrastructure.md) |
| Project definition (Core-to-Shell) | [docs/project.md](docs/project.md) |

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

The Apache 2.0 license was chosen over MIT specifically for its patent grant clause, which is relevant for healthcare software. Commercial use is permitted. Warranty and liability are disclaimed. See [docs/security/overview.md](docs/security/overview.md) for the full legal positioning of this project.
