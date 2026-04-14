# Infrastructure Reference

## Hosted Demo Stack

The hosted demo is a cost-constrained reference deployment, not a production service. Its
purpose is to give developers a live endpoint to query before committing to a self-hosted
deployment. It is not intended for production application traffic.

| Component | Technology | Configuration |
|-----------|-----------|---------------|
| API compute | Fly.io | 2x shared-CPU containers, 256MB RAM each |
| Database | Fly Postgres | Single instance, scales to read replicas if needed |
| Object storage | S3-compatible | Dataset snapshots + ingestion cache |
| CDN | Cloudflare free tier | Static docs and cached API responses |

The API containers are stateless. Fly.io auto-scales them to zero during off-hours, which
keeps compute costs minimal. The database is the only stateful component and runs as a managed
Fly Postgres instance.

---

## Cost Estimates

All figures are for the hosted demo deployment at modest scale (~100k requests/day).

| Component | Estimated Monthly Cost | Notes |
|-----------|----------------------|-------|
| PostgreSQL (Fly Postgres) | $15–$30 | Single instance; read replicas add ~$15–30 each |
| API compute (Fly.io 2x 256MB) | $10–$20 | Scales to zero off-hours; stateless |
| S3 / object storage | $2–$5 | Dataset snapshots + OpenFDA ingestion cache |
| CDN (Cloudflare free tier) | $0 | Covers static docs and cached API responses |
| **Total** | **~$27–$55/month** | Within GitHub Sponsors or OSS fund coverage |

At 10x query volume, the PostgreSQL cost increases significantly (read replicas, larger
instance class). The compute cost is largely stable — stateless horizontal scaling is cheap
at Fly.io. See [Scaling Triggers](#scaling-triggers) for the response plan.

---

## Self-Hosted Requirements

### Minimum Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Docker Engine | 24+ | Latest stable |
| Docker Compose | v2 | v2 |
| RAM | 512MB | 2GB |
| PostgreSQL | 16 (via container or managed) | 16 |
| Disk | 5GB | 20GB |

The 512MB minimum is tight. It accommodates the API container and PostgreSQL container running
together with a small dataset. If the ingestion pipeline is run on the same host, 2GB is
required to avoid OOM kills during the OpenFDA bulk label processing step.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/ruhwa-innovation-labs/melo-rx.git
cd melo-rx

# Start all services
docker compose up -d

# Verify health
curl http://localhost:3000/health
```

The `docker-compose.yml` in the repository root is the canonical specification for both local
development and self-hosted production deployment. It defines the API service, PostgreSQL
service, and the necessary volume mounts and environment variable bindings.

### Database Options

**Container (default).** The `docker-compose.yml` includes a PostgreSQL 16 container with a
named volume for data persistence. This is appropriate for single-server self-hosted
deployments.

**Managed PostgreSQL.** Operators who prefer a managed database (AWS RDS, Google Cloud SQL,
Neon, Supabase) can set the `DATABASE_URL` environment variable to point to their managed
instance and remove the `db` service from their `docker-compose.yml`. PostgreSQL 16 or later
is required.

---

## Object Storage

Object storage is used for two purposes:

**Dataset snapshots.** Each ingestion pipeline run produces a versioned snapshot of the full
interaction dataset in JSON and CSV format. Snapshots are stored in S3-compatible object
storage and are publicly readable. Researchers and operators can download a point-in-time
export without querying the API.

**Ingestion cache.** The OpenFDA bulk label download is large (~2GB uncompressed for the
full label set). The pipeline caches the downloaded archive in object storage to avoid
re-downloading on subsequent runs. The NDF-RT source files are also cached here.

Estimated storage at v1.0 scale: 2–5GB. Growth is driven by dataset version history, not
by query volume — the API itself does not write to object storage.

Self-hosted operators who do not need dataset export functionality can disable the S3
integration by leaving `S3_BUCKET` unset. The ingestion pipeline will re-download source
files on each run. This is acceptable for infrequent ingestion runs (monthly) but inefficient
for development.

---

## CDN

The Cloudflare free tier covers:

- The VitePress documentation site (static assets)
- Cached API responses for the hosted demo (where `Cache-Control` permits)

The API itself does not rely on CDN caching for correctness — all responses are served from
the origin. CDN caching is a latency and cost optimization for the hosted demo, not a
correctness requirement.

Self-hosted operators do not need a CDN. The Docker Compose deployment serves the API
directly from the container.

---

## Scaling Triggers

These thresholds are drawn from the project definition's scalability planning. They are
forward-looking targets, not current configuration.

| Trigger | Response |
|---------|----------|
| 10x query volume (~1M requests/day) | Read replicas on PostgreSQL; Redis LRU cache for hot drug pairs (1hr TTL) |
| 10x dataset size (~50,000+ interaction pairs) | Materialized views for class expansion; partition `drug_interaction` by severity |
| Multi-region deployment | Stateless API containers behind CDN; read-only replicas per region |
| Enterprise SLA requirement | Helm chart for Kubernetes; optional commercial support via GitHub Sponsors |
| FHIR mandate | Add FHIR R4 `MedicationKnowledge` endpoint wrapper |

The read replica and Redis caching response to 10x query volume is the most likely first
scaling step. The hosted demo Fly Postgres instance supports read replicas with minimal
configuration change.

---

## Infrastructure as Code

**`docker-compose.yml` is the canonical specification** for local development and self-hosted
production deployment. It is the single source of truth for service definitions, environment
variables, volume mounts, health check configuration, and network topology.

Changes to the deployment topology must be reflected in `docker-compose.yml` before they are
applied to any environment. The Fly.io configuration (`fly.toml`) derives from the same
service definitions.

**Helm chart.** A Helm chart for Kubernetes deployment will be provided at the v1.0 release.
The chart will parameterize the same configuration surface as `docker-compose.yml`:
`DATABASE_URL`, `API_KEY_SECRET`, resource limits, replica counts, and ingress configuration.

Self-hosted operators on Kubernetes should wait for the v1.0 Helm chart rather than
maintaining a custom chart against a moving target.

---

## Fly.io Deployment Notes

The hosted demo runs on Fly.io with the following configuration:

- Region: `iad` (US East — primary) with potential secondary regions post-v1.0
- Release command: `drizzle-kit migrate` runs against the Fly Postgres instance before each
  new version is promoted to live traffic
- Health check: Fly.io liveness probe hits `GET /health` every 30 seconds with a 5-second
  timeout; 3 consecutive failures trigger a container restart
- Zero-downtime deploys: Fly.io rolling deploy strategy — new container must pass health
  check before old container is terminated

Operators deploying to other platforms (Railway, Render, AWS ECS) should replicate the same
liveness probe configuration against `GET /health` and run migrations as a release command
or init container before the API container starts.
