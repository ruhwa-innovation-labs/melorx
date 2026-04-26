# Local Development Setup

A new engineer with Node.js 22+ and Docker installed should be able to follow this guide alone and reach a running API with a successful query.

---

## Prerequisites

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Node.js | 22.x | `node --version` |
| pnpm | 9.x | `pnpm --version` |
| Docker | 24.x | `docker --version` |
| Docker Compose | v2 (plugin, not standalone) | `docker compose version` |
| Git | 2.x | `git --version` |

> If pnpm is not installed: `npm install -g pnpm@9` — then close and reopen your terminal.

---

## Step-by-Step Setup

### 1. Clone the repository

```bash
git clone https://github.com/ruhwa-innovation-labs/melorx.git
cd melorx
```

### 2. Install dependencies

```bash
pnpm install
```

This installs all workspace packages (`packages/core`, `packages/api`, `packages/cli`, `packages/client`) and pipeline dependencies in a single pass.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | Required | What to set |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `postgres://melo:melo@localhost:5432/melorx` |
| `RXNORM_API_BASE` | No | Leave as default — `https://rxnav.nlm.nih.gov/REST` |

All other variables have defaults that are safe for local development. See [environment-variables.md](./environment-variables.md) for the full reference.

### 4. Start PostgreSQL

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container on port `5432`. Verify it is healthy before continuing:

```bash
docker compose ps
```

The `db` service should show `healthy` or `running`.

### 5. Run database migrations

```bash
pnpm db:migrate
```

This runs all Drizzle ORM migrations from `db/migrations/` against the local database, creating the `drug_concept`, `drug_interaction`, and `drug_class_interaction` tables.

### 6. Seed ONCHigh data

```bash
pnpm db:seed
```

This loads the v0.1 ONCHigh seed — 437 clinician-curated drug interaction pairs. The seed is idempotent; running it more than once is safe.

### 7. Start the API in watch mode

```bash
pnpm dev
```

The Hono server starts on port `3000` by default. Watch mode recompiles and restarts on file changes.

### 8. Verify the API is running

```bash
curl "http://localhost:3000/health"
```

Expected response:

```json
{"status":"ok"}
```

### 9. Run your first interaction query

This query checks the ibuprofen (RxCUI 5640) and lisinopril (RxCUI 29046) interaction:

```bash
curl "http://localhost:3000/v1/interactions?drug1=5640&drug2=29046"
```

You should receive a structured response with `severity: "moderate"`, mechanism text, management guidance, a source citation to ONCHigh, and the required `disclaimer` field.

---

## Running Tests

```bash
pnpm test
```

Tests run against a real seeded PostgreSQL instance. Docker must be running before executing the test suite. See [testing-strategy.md](./testing-strategy.md) for the full breakdown of what is tested and how.

---

## Running the Ingestion Pipeline Locally

To re-ingest the ONCHigh dataset manually (useful when testing pipeline changes):

```bash
pnpm pipeline:seed:onchigh
```

This runs the ONCHigh ETL adapter, parses the source file, maps severity values to the canonical enum, and upserts the results into your local database.

---

## Common Problems

### PostgreSQL port conflict: 5432 already in use

Another PostgreSQL instance is already running on your machine (common on macOS with Homebrew Postgres).

**Option A** — Stop the conflicting service:
```bash
brew services stop postgresql@16
```

**Option B** — Change the exposed port in `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"   # expose on 5433 locally
```

Then update `DATABASE_URL` in your `.env`:
```
DATABASE_URL=postgres://melo:melo@localhost:5433/melorx
```

---

### pnpm version mismatch

If you see an error like `ERR_PNPM_BAD_PM_VERSION`, your pnpm version does not satisfy the `packageManager` field in `package.json`.

```bash
pnpm self-update
# or install the exact version required
npm install -g pnpm@9
```

---

### Node version mismatch

If you see a version warning or unexpected syntax errors, confirm your active Node version:

```bash
node --version   # must be 22.x or higher
```

If you are using a version manager (nvm, fnm, volta):

```bash
# nvm
nvm install 22
nvm use 22

# fnm
fnm install 22
fnm use 22
```
