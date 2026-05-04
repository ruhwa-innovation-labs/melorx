# Deployment Pipeline

## Pipeline Overview

The CI/CD pipeline has two modes:

**Branch push.** Runs on every push to any branch. Executes tests, typecheck, lint, and
dependency audit. Does not build or push a Docker image. This mode gates pull request merges
and gives contributors immediate feedback.

**Merge to main.** Runs all branch-push steps, then builds the Docker image, pushes it to
Docker Hub, and triggers a deploy to the Fly.io hosted demo.

---

## GitHub Actions Workflow Steps

Steps run in order. A failure at any step halts the pipeline. Steps are not parallelized
except where explicitly noted.

### 1. `pnpm install`

```yaml
- run: pnpm install --frozen-lockfile
```

The `--frozen-lockfile` flag ensures the installed modules exactly match `pnpm-lock.yaml`.
If the lockfile is out of sync with `package.json` manifests, this step fails. This prevents
dependency drift between CI and local environments.

### 2. `pnpm typecheck`

```yaml
- run: pnpm typecheck
```

Runs `tsc --noEmit` across all packages in the monorepo (`packages/core`, `packages/api`,
`packages/cli`, `packages/client`). Type errors in any package fail the build. This is the
fastest signal that a cross-package type contract has been broken.

### 3. `pnpm lint`

```yaml
- run: pnpm lint
```

Runs ESLint across the monorepo. The ESLint configuration enforces consistent code style and
catches common error patterns. Lint warnings are reported but do not fail the build; lint
errors do.

### 4. `pnpm test --coverage`

```yaml
- run: pnpm test --coverage
```

Runs Vitest across all packages. Integration tests execute against a real PostgreSQL 16
instance provided by a GitHub Actions `services` container — the same version used in
production. The PostgreSQL service is seeded with the test fixture dataset before the test
run begins.

Coverage reports are uploaded as artifacts. There is no enforced coverage threshold at
pre-v1.0; coverage gates will be introduced at v1.0.

The PostgreSQL service configuration in the workflow file:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: melo_rx_test
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

### 5. `pnpm audit`

```yaml
- run: pnpm audit --audit-level high
```

Runs `pnpm audit` against the lockfile. The pipeline fails if any advisory is rated `high`
or `critical`. Moderate and low advisories are reported in the build log but do not block
the pipeline.

This step runs after tests because audit failures are less common than test failures and
should not mask test output.

### 6. `pnpm build` (main branch only)

```yaml
- if: github.ref == 'refs/heads/main'
  run: pnpm build
```

Compiles all packages to their `dist/` output directories. This step only runs on merges
to main. It verifies that the compiled output is producible before the Docker image build
step attempts to copy it.

### 7. Docker build and push (main branch only)

```yaml
- if: github.ref == 'refs/heads/main'
  run: |
    docker build -t melo-rx/api:${{ github.sha }} -t melo-rx/api:latest .
    docker push melo-rx/api:${{ github.sha }}
    docker push melo-rx/api:latest
```

Builds the Docker image using the `Dockerfile` in the repository root and pushes two tags:

- `melo-rx/api:<git-sha>` — immutable, references the exact commit
- `melo-rx/api:latest` — floating tag, always points to the most recent main build

The SHA tag is used by the Fly.io deploy step to reference a specific image version.
The `latest` tag is used by self-hosted operators who want to track the current release
without specifying an explicit version.

---

## Ingestion Pipeline Schedule

The data ingestion pipeline runs on a separate schedule from the application CI/CD pipeline.

**OpenFDA bulk download + NLP extraction** runs on the 1st of each month via a GitHub Actions
scheduled workflow (`schedule: cron: '0 2 1 * *'`). The pipeline:

1. Downloads the current OpenFDA drug label bulk archive
2. Verifies the SHA-256 checksum against the published value
3. Runs the NLP interaction extraction pipeline against new or updated labels
4. Inserts new interaction pairs with `confidence` scores; pairs below 0.75 are flagged for
   human review and not served in production until approved
5. Updates the `pipeline_run` table with run metadata (pairs ingested, pairs rejected, errors)

**NDF-RT refresh** runs quarterly (`schedule: cron: '0 3 1 */3 *'`). The NDF-RT source is
updated less frequently than OpenFDA labels; a quarterly schedule avoids unnecessary
re-processing.

If an ingestion run fails (checksum mismatch, parse error, database error), the pipeline
logs the failure to the `pipeline_run` table and exits with a non-zero code. GitHub Actions
sends a failure notification. No partial data is committed to the database on a failed run —
the ingestion adapter uses a transaction that rolls back on error.

---

## Secrets Management

The following secrets are stored in GitHub Actions repository secrets and are never committed
to the repository or written to build logs:

| Secret | Usage |
|--------|-------|
| `DATABASE_URL` | PostgreSQL connection string for production and ingestion pipeline |
| `API_KEY_SECRET` | Signing key for API key bearer tokens (hosted demo) |
| `FLY_API_TOKEN` | Fly.io deploy authentication |
| `DOCKER_HUB_TOKEN` | Docker Hub push authentication |
| `S3_ACCESS_KEY_ID` | Object storage access key |
| `S3_SECRET_ACCESS_KEY` | Object storage secret key |

Secrets are injected as environment variables at the step level, not at the job level, to
minimize the blast radius of any accidental exposure. Secrets are not passed to pull request
workflows from forks — ingestion and deploy steps run only on the main branch with direct
push access.

All database connections in the application use `DATABASE_URL` as a single connection string.
There is no code that constructs a connection string from individual host/user/password parts;
this ensures that no partial credential can appear in logs or error messages.

---

## Deployment to Fly.io

Fly.io deployment is triggered after the Docker push step succeeds on main:

```yaml
- if: github.ref == 'refs/heads/main'
  run: flyctl deploy --image melo-rx/api:${{ github.sha }}
```

The deploy uses a rolling strategy. Fly.io starts the new container version, waits for the
liveness probe (`GET /health`) to return `200`, and only then terminates the old version.
Zero-downtime is achieved as long as the new version passes its health check within the
configured timeout (30 seconds, 3 retries).

If the new version fails its health check, Fly.io aborts the deploy and the previous version
remains live. The failed deploy is visible in the GitHub Actions log and in the Fly.io
dashboard.

Database migrations (`drizzle-kit migrate`) run as a Fly.io release command before the new
container version receives traffic. If the migration fails, the deploy is aborted before any
traffic hits the new version.

---

## Dataset Release Process

Dataset changes (new interaction pairs, severity corrections, source citation updates) are
versioned independently from the application code using a semver dataset tag.

**Tagging convention:** `v0.1.0`, `v0.2.0`, `v0.3.0` — minor version bumps for new data
sources (ONCHigh, NDF-RT, OpenFDA); patch version bumps for corrections to existing pairs.

**`DATASET_CHANGELOG.md`** is updated on every dataset version tag. Each entry records:

- Tag version and date
- Number of pairs added, modified, or removed
- Source(s) for new pairs
- Any severity corrections and their rationale
- Any pairs removed and why

The dataset version is included in every API response under `meta.dataset_version`, allowing
downstream applications to detect when the underlying data has changed and re-evaluate any
cached interaction results.

Dataset releases do not require an application code change. The pipeline can tag a new dataset
version, update the changelog, and the new data is live on the next ingestion run.
