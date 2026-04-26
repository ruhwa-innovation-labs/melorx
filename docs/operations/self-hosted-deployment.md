# Self-hosted deployment

This guide walks through deploying melorx on your own infrastructure. The
image is published to GitHub Container Registry and is free to pull and
redistribute under Apache 2.0.

> **Not for clinical decision-making.** melorx is an informational
> reference tool. Every response from `/v1/interactions*` endpoints carries
> a non-suppressible `disclaimer` field. Self-hosting does not change that.

---

## Two deployment shapes

melorx ships **two production compose files**. Pick the one that matches
your operational story — the data-persistence story is the difference.

| Shape | DB strategy | When to use | Compose file |
|---|---|---|---|
| **Managed DB (recommended)** | Postgres lives outside Docker — managed service (RDS, Hetzner, Neon, Supabase) or a separate VM you operate. melorx connects via `DATABASE_URL`. | Production. Backups, replication, point-in-time-recovery handled by the DB platform. | `docker-compose.prod.yml` |
| **Bundled bind-mount fallback** | Postgres runs as a sibling container, but persistent data lives on a **host filesystem path** you control (`/var/lib/melorx/postgres`), not in a Docker-managed named volume. | Single-host deployments where you don't want a separate DB. Acceptable for low-traffic / internal use; you must run your own backups (cron + `pg_dump` example below). | `docker-compose.bundled.yml` |

> **Why not Docker named volumes?** Docker's named volumes (`volumes: postgres_data:`) live inside Docker's storage area (`/var/lib/docker/volumes/...`). They survive `docker compose down` but **not** `docker volume prune`, accidental `docker system prune --volumes`, host migration, or Docker reinstall. The DDI dataset takes hours to seed and re-enrich; losing it is a real outage. Both compose files in this guide therefore avoid Docker named volumes — managed DB has no Docker storage at all, and the bundled variant binds to a real filesystem path operators back up.

---

## At a glance

```bash
# Recommended path: bring your own Postgres, run only the API container.
docker pull ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
cp .env.example .env       # set DATABASE_URL=postgres://... pointing at managed DB
docker compose -f docker-compose.prod.yml up -d
```

That's it once you have the compose file below and a populated `.env`. The
remainder of this guide is the longer version of those two commands, plus
the bundled fallback.

---

## Prerequisites

- A host with Docker 24+ and `docker compose` plugin (or a Kubernetes cluster
  — snippets below are compose-first).
- **Postgres 16** somewhere reachable from the host.
- Outbound internet access from the host for pulling the image and (if you
  use the scheduled ingest workflow) reaching `api.fda.gov`.
- A TLS terminator in front of the API if you're exposing it publicly. Caddy
  snippet included below.

Optional:

- **RxNorm RRF files** (UMLS license, free) at `/var/lib/melorx/rxnorm/` on
  the host, if you want to run `pnpm db:seed:classes` or `pnpm db:enrich`
  against your own database. The image mounts them at
  `/app/pipeline/resolver/raw/` inside the container.

---

## 1. Pull the image

Every release ships a versioned image plus `:latest`:

```bash
docker pull ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0   # immutable
docker pull ghcr.io/ruhwa-innovation-labs/melorx:latest   # floating
```

Between tagged releases, the `:edge` tag tracks `main`:

```bash
docker pull ghcr.io/ruhwa-innovation-labs/melorx:edge
```

Every commit to `main` also produces an immutable `:sha-<short>` tag you can
pin to for zero-drift rollbacks.

---

## 2. Environment variables

All configuration is environment-driven. Create `.env` on the host:

```bash
# Required
DATABASE_URL=postgres://melo:strong-password@your-postgres-host:5432/melorx

# Optional (defaults shown)
API_PORT=3000
LOG_LEVEL=info
NODE_ENV=production
DATABASE_POOL_SIZE=10
NLP_CONFIDENCE_THRESHOLD=0.75
HOSTED_MODE=false
```

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres DSN. |
| `API_PORT` | no | `3000` | Port the Hono server listens on. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, or `error`. |
| `NODE_ENV` | no | `production` | Controls pino log formatting. |
| `DATABASE_POOL_SIZE` | no | `10` | Max concurrent DB connections per process. |
| `NLP_CONFIDENCE_THRESHOLD` | no | `0.75` | Rule #6 gate. Do not lower. |
| `HOSTED_MODE` | no | `false` | Leave `false` for self-hosted. |
| `OPENFDA_DOWNLOAD_URL` | no | `https://api.fda.gov/download.json` | OpenFDA bulk index endpoint. Override for a mirror. |
| `RXNORM_API_BASE` | no | `https://rxnav.nlm.nih.gov/REST` | RxNorm live-lookup fallback. |

Never commit `.env` to a repository — the API reads it directly at container
start via `docker compose`'s `env_file` directive.

---

## 3. Production compose — managed DB (recommended)

This is the default shape. Postgres is **not** in the compose file. Provision
it on a managed service (RDS / Hetzner / Neon / Supabase / your DB VM) and
put the DSN in `.env`.

`docker-compose.prod.yml`:

```yaml
name: melorx

services:
  migrate:
    image: ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
    env_file: .env
    command: ["pnpm", "db:migrate"]
    restart: "no"

  api:
    image: ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"    # bind to loopback; TLS terminator exposes it
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
```

Bring it up:

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
```

The `migrate` service runs once per `up` and exits — compose's
`service_completed_successfully` ensures `api` only starts after migrations
succeed.

Verify health:

```bash
curl -sS http://127.0.0.1:3000/health
# → {"status":"ok","db":"connected","version":"0.3.0"}
```

### Why no `volumes:` section?

There is nothing local to persist. The dataset lives in the managed DB. The
API container is stateless and disposable — `docker compose down -v` is safe.

---

## 4. Bundled compose — Postgres with host bind-mount

For single-host setups where you don't want a separate managed DB, this
shape runs Postgres in the same compose project but **binds its data
directory to a host filesystem path**. The path is yours to back up, snapshot,
and migrate between machines. **Docker named volumes are deliberately
avoided** to prevent the data-loss footgun described above.

`docker-compose.bundled.yml`:

```yaml
name: melorx

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: melorx
      POSTGRES_USER: melo
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      # Bind to a host directory so the data survives container removal,
      # Docker reinstall, and `docker volume prune`. You back this up.
      - /var/lib/melorx/postgres:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"   # loopback only; API talks via the docker network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U melo -d melorx"]
      interval: 10s
      timeout: 5s
      retries: 10

  migrate:
    image: ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    command: ["pnpm", "db:migrate"]
    restart: "no"

  api:
    image: ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
    restart: unless-stopped
    depends_on:
      migrate:
        condition: service_completed_successfully
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
```

**Operator setup before first `up`:**

```bash
# Create the bind-mount target with the right ownership for the postgres image.
sudo mkdir -p /var/lib/melorx/postgres
sudo chown -R 70:70 /var/lib/melorx/postgres   # postgres-alpine runs as uid 70
sudo chmod 700 /var/lib/melorx/postgres
```

Then your `.env` uses the in-network DSN:

```
DATABASE_URL=postgres://melo:${POSTGRES_PASSWORD}@postgres:5432/melorx
POSTGRES_PASSWORD=...   # picked up by the postgres service via :? expansion
```

Bring it up:

```bash
docker compose -f docker-compose.bundled.yml up -d
```

If you ever need to wipe and restart, the data lives at
`/var/lib/melorx/postgres` — back it up first, delete the directory, recreate
it with the chown step above. There is no Docker volume to lose.

---

## 5. Seed data (first deploy)

On an empty DB:

```bash
# Pick the compose file you used.
docker compose -f docker-compose.prod.yml run --rm api pnpm db:seed
# or
docker compose -f docker-compose.bundled.yml run --rm api pnpm db:seed
```

For broader coverage you'll want the class rules + identifier enrichment.
That step needs the RxNorm RRF files (UMLS license, free):

```bash
# On the host, download the RRFs once.
sudo mkdir -p /var/lib/melorx/rxnorm
# Follow https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html
# Unzip RXNCONSO.RRF / RXNREL.RRF / RXNSAT.RRF into /var/lib/melorx/rxnorm

# Then seed with the files mounted into the container:
docker compose -f docker-compose.prod.yml run --rm \
  -v /var/lib/melorx/rxnorm:/app/pipeline/resolver/raw:ro \
  api pnpm db:seed:classes

docker compose -f docker-compose.prod.yml run --rm \
  -v /var/lib/melorx/rxnorm:/app/pipeline/resolver/raw:ro \
  api pnpm db:enrich
```

The RRFs are read-only at runtime — the volume mount uses `:ro`.

---

## 6. Reverse proxy

### Caddy (recommended)

```caddy
# /etc/caddy/Caddyfile
api.yourdomain.example {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        health_uri   /health
        health_interval 30s
    }
    header {
        Strict-Transport-Security "max-age=63072000"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
        Referrer-Policy           "strict-origin-when-cross-origin"
    }
    log {
        output file /var/log/caddy/melorx.log
    }
}
```

Caddy handles TLS certificates automatically via Let's Encrypt.

### Nginx alternative

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.example;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.example/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
    }

    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:3000/health;
    }
}
```

---

## 7. Bare-metal (systemd) alternative

If you prefer not to use compose:

```ini
# /etc/systemd/system/melorx.service
[Unit]
Description=melorx API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=exec
Restart=always
RestartSec=5
EnvironmentFile=/etc/melorx/env
ExecStartPre=/usr/bin/docker pull ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
ExecStartPre=/usr/bin/docker run --rm --env-file=/etc/melorx/env \
    ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0 pnpm db:migrate
ExecStart=/usr/bin/docker run --rm --name melorx-api \
    --env-file=/etc/melorx/env \
    -p 127.0.0.1:3000:3000 \
    ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
ExecStop=/usr/bin/docker stop melorx-api

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now melorx
```

This unit assumes `DATABASE_URL` in `/etc/melorx/env` points at a managed
Postgres. Adapt to the bundled flavor by adding a separate
`postgres.service` unit that mounts `/var/lib/melorx/postgres`.

---

## 8. Upgrades

Zero-downtime rolling upgrade for the compose deployment:

```bash
# 1. Pull the new image.
docker pull ghcr.io/ruhwa-innovation-labs/melorx:v0.4.0

# 2. Run migrations against the live DB before flipping traffic.
docker run --rm --env-file .env \
    ghcr.io/ruhwa-innovation-labs/melorx:v0.4.0 pnpm db:migrate

# 3. Edit docker-compose.prod.yml to bump the image tag → :v0.4.0
#    then recreate the API container (the DB you manage, or the bundled
#    Postgres pinned to a separate tag, keeps running).
docker compose -f docker-compose.prod.yml up -d --no-deps api
```

Compose will run the migrate job again with the new image (idempotent since
step 2 already applied the pending migrations) and replace the API container
only after the new one passes `/health`.

Rollback is the reverse: bump the tag down and run `up -d --no-deps api`.
Schema migrations are additive across our releases (see `db/migrations/`),
so a version downgrade is safe unless release notes say otherwise.

---

## 9. Backups

### Managed DB

Use the platform's native backup story (RDS automated snapshots, Neon
PITR, etc.). Verify restores quarterly.

### Bundled bind-mount

Two complementary strategies:

**A. Logical dump (portable, smaller, slower).**

```bash
# /etc/cron.daily/melorx-backup
COMPOSE=/srv/melorx/docker-compose.bundled.yml
BACKUP=/var/backups/melorx/$(date +%F).dump.gz
mkdir -p "$(dirname "$BACKUP")"
docker compose -f "$COMPOSE" exec -T postgres \
    pg_dump -U melo -Fc melorx \
    | gzip > "$BACKUP"
find /var/backups/melorx -name '*.dump.gz' -mtime +30 -delete
```

Restore:

```bash
gunzip -c /var/backups/melorx/2026-04-23.dump.gz \
  | docker compose -f docker-compose.bundled.yml exec -T postgres \
    pg_restore -U melo -d melorx --clean --if-exists
```

**B. Filesystem snapshot (fast, host-specific).**

If the bind-mount path lives on ZFS/btrfs/LVM, snapshot the directory while
the DB is briefly stopped (or use the engine's online-backup mechanism with
checkpoints).

```bash
docker compose -f docker-compose.bundled.yml stop postgres
sudo zfs snapshot tank/melorx@$(date +%F)
docker compose -f docker-compose.bundled.yml start postgres
```

Always combine with the logical dump so you have a portable restore option
for new hardware.

---

## 10. Observability

The API emits structured logs (pino JSON) to stdout. Pipe the container
output into whatever aggregation stack you run (Loki, CloudWatch, Datadog,
plain `journalctl -u melorx`).

Minimum alerts worth configuring:

- `/health` returns non-200 for more than 60 seconds.
- Postgres container becomes unhealthy (bundled flavour) or DB connections
  fail (managed flavour).
- Container restart rate exceeds 3/hour.
- (Bundled flavour) free space on `/var/lib/melorx/postgres` filesystem
  drops below 20%.

Metrics endpoint (`/metrics`, Prometheus format) is scheduled for v1.0 — not
yet wired.

---

## 11. Troubleshooting

**`/health` returns `{"db": "error"}`.**
API cannot reach Postgres. Verify `DATABASE_URL` host/port reachability from
the `api` container:

```bash
docker compose -f docker-compose.prod.yml exec api \
    sh -c 'echo "select 1" | nc -vz $POSTGRES_HOST 5432'
```

**`pnpm db:migrate` exits non-zero with "permission denied".**
The DB user in `DATABASE_URL` needs CREATE TABLE / CREATE TYPE permissions
on the target database. For managed Postgres, grant them explicitly:

```sql
GRANT ALL PRIVILEGES ON DATABASE melorx TO melo;
GRANT ALL ON SCHEMA public TO melo;
```

**`/v1/interactions` returns empty array for a pair you know is seeded.**
Verify the seed ran against the right DB:

```bash
docker compose -f docker-compose.prod.yml exec api \
    sh -c 'psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM drug_interaction;"'
```

If zero, rerun `pnpm db:seed`. If non-zero but still missing the pair,
confirm `confidence >= 0.75` for the relevant row (Rule #6 filters sub-0.75
rows — see ADR-004).

**OpenFDA partition fails with "checksum mismatch".**
Re-run `pnpm cli ingest all --force` — OpenFDA occasionally republishes a
partition with a different checksum but the same partition id. The actual
downloaded hash is recorded in `pipeline_state` on success.

**Bundled bind-mount: postgres container won't start, "permission denied".**
The host-path ownership has to match the postgres-alpine uid (70):

```bash
sudo chown -R 70:70 /var/lib/melorx/postgres
sudo chmod 700 /var/lib/melorx/postgres
```
