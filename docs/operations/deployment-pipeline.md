# Deployment Pipeline

melorx uses a release-please-driven pipeline that produces two kinds of
artefact from every release:

- A **Docker image** published to GitHub Container Registry
  (`ghcr.io/ruhwa-innovation-labs/melorx`) — consumed by self-hosted operators.
- An **npm package**, `@melorx/client` — consumed by application developers.

There is no single "production" environment owned by the project. melorx
is self-hosted by its users; the CI/CD pipeline's job is to produce trusted,
signed artefacts, not to run a hosted service.

---

## Overview

```
┌────────────┐     Conventional Commits     ┌─────────────────────┐
│  feature   │ ───────────────────────────▶ │  release-please PR  │
│    PRs     │                              │  (opens on main)     │
└────────────┘                              └─────────┬───────────┘
     │                                                │
     │ CI (ci.yml)                                    │ merge
     │ — typecheck                                    ▼
     │ — 187 tests                           ┌─────────────────────┐
     │ — client build                        │  GitHub Release +   │
     │                                       │  tags               │
     ▼                                       └─────────┬───────────┘
 all green? ──▶ merge to main                          │
                 │                                     ▼
                 ▼                           ┌─────────────────────┐
      ┌──────────────────────┐               │ publish.yml         │
      │ docker-edge.yml      │               │ ├─ npm publish      │
      │ → ghcr.io/...:edge    │               │ │   @melorx/client │
      │ → ghcr.io/...:sha-<…> │               │ └─ docker push      │
      └──────────────────────┘               │     :v0.3.0 + :latest│
                                             └─────────────────────┘
```

Five workflows make this happen:

| Workflow | Trigger | Produces |
|---|---|---|
| `ci.yml` | every PR + push to `main` | typecheck + 187 tests + client build sanity |
| `validate-community.yml` | PRs touching `pipeline/sources/community/**` | schema validation for community-contributed pairs |
| `docker-edge.yml` | push to `main` | `:edge` and `:sha-<short>` Docker images on GHCR |
| `release-please.yml` | push to `main` | opens / updates the release PR |
| `publish.yml` | `release.published` event | versioned npm publish + versioned Docker image |
| `scheduled-ingest-openfda.yml` | cron (`0 2 1 * *`) + manual dispatch | monthly OpenFDA ingest + promote (opt-in per `OPENFDA_DATABASE_URL` secret) |

---

## Branching & commit discipline

- Conventional Commits required on `main` (enforced by convention, not a
  bot). `feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, `test:`, `build:`,
  `ci:`, `chore:`, `deps:`, `revert:`. `!` or a `BREAKING CHANGE:` footer
  triggers a major version bump.
- Feature branches rebase onto `main`. No merge commits.
- Every PR must pass `ci.yml` before merge.

`release-please` parses these commits to decide what to bump and what goes
in the CHANGELOG.

---

## CI workflow (`ci.yml`)

Runs on every PR and every push to `main`. One job, one Postgres 16 service
container, full workspace test matrix.

Steps:

1. `pnpm install --frozen-lockfile`
2. `pnpm -r typecheck`
3. `pnpm db:migrate`
4. `pnpm db:seed` — loads the 5-pair ONCHigh curated seed.
5. `pnpm db:seed:ci` — loads the minimal RxNorm-derived fixture the
   integration tests need, without shipping the 1.2 GB RxNorm RRFs to CI.
6. `pnpm -r test` — 187 tests across `@melorx/core`, `@melorx/client`,
   `@melorx/pipeline`, `@melorx/api`, `@melorx/cli`.
7. `pnpm --filter @melorx/client build` — sanity-checks the publish output.
8. Assert that the client DTS does not leak `@melorx/core` imports.

Coverage gates will be introduced at v1.0. `pnpm audit` is run by Dependabot
on a weekly cadence; CI does not hard-fail on new advisories.

---

## Docker publishing

### Edge (`docker-edge.yml`)

Every push to `main` builds and pushes:

- `ghcr.io/ruhwa-innovation-labs/melorx:edge` — floating, tracks `main`.
- `ghcr.io/ruhwa-innovation-labs/melorx:sha-<short>` — immutable.

This gives operators a way to test the latest code before the next tagged
release and provides a rollback target.

### Versioned (`publish.yml`)

On every `release.published` event whose tag matches `melorx-v*`:

- `ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0`
- `ghcr.io/ruhwa-innovation-labs/melorx:latest`
- `ghcr.io/ruhwa-innovation-labs/melorx:sha-<commit>`

Both edge and versioned builds share `.github/workflows/_reusable-docker-build.yml`
(build-push-action v5, Buildx cache backed by the GitHub Actions cache,
provenance + SBOM enabled).

### Image contents

The `Dockerfile` at the repo root produces a single runtime image (Node
22-alpine). See `docs/operations/self-hosted-deployment.md` for the
operator-facing guide.

Size budget: the current image is ~250 MB uncompressed (includes all
workspace source for `tsx`-based startup and `drizzle-kit` for migrations).
A slimmer bundle target is a future optimisation.

---

## npm publishing

`@melorx/client` is the only public npm package. Everything else in the
workspace is `private: true`.

On `release.published` for a `client-v*` tag, `publish.yml` runs:

```bash
pnpm install --frozen-lockfile
pnpm --filter @melorx/client build
cd packages/client
npm publish --provenance --access public --tag <dist-tag>
```

- `<dist-tag>` is `next` when the version contains a pre-release suffix
  (e.g. `0.3.0-rc.1`), otherwise `latest`.
- `--provenance` is enabled via `.npmrc`. The publish runner has
  `id-token: write` so npm can attest the build came from this repository.
- The job fails if `packages/client/package.json`'s version does not match
  the release tag (defensive check against manual tag drift).

Required repository secret: `NPM_TOKEN` — an npm automation token with
publish access to the `@melorx` scope. The scope must be created on
npmjs.com before the first publish.

---

## Release-please

- Config: `release-please-config.json` (manifest mode).
- State: `.release-please-manifest.json` (current version per package).
- Workflow: `.github/workflows/release-please.yml` runs on push to `main`.

Two packages are versioned independently:

1. **Root "melorx"** (`.`) — the app / Docker image version. Tag format:
   `melorx-v<semver>`.
2. **`packages/client`** — the npm package version. Tag format:
   `client-v<semver>`.

Workspace cross-links (`pnpm-workspace` internal deps) are kept in sync by
the `node-workspace` plugin.

Merging the open release PR for a package bumps its version, updates its
`CHANGELOG.md`, cuts the Git tag, publishes the GitHub Release, and fires
`publish.yml` with the appropriate tag.

---

## Scheduled ingestion

`.github/workflows/scheduled-ingest-openfda.yml` runs the OpenFDA
bulk-download → extract → review-queue → promote cycle on the first of each
month at 02:00 UTC, or on manual dispatch.

This workflow is **opt-in**. It short-circuits unless the
`OPENFDA_DATABASE_URL` repository secret is set. Operators who want to
update their self-hosted dataset on the project's schedule can add the
secret; everyone else leaves the workflow dormant.

The `scheduled-ingest-openfda.yml` workflow:

1. Checks for the `OPENFDA_DATABASE_URL` secret. Logs and exits 0 if absent.
2. Applies pending migrations.
3. Runs `pnpm cli ingest all --max-partitions 3` (override via input).
4. Runs `pnpm db:promote` to move eligible review-queue rows into
   `drug_interaction` (enforcing Rule #6 at write time).

A future `scheduled-ingest-ndf-rt.yml` could sit alongside — currently
deferred per ADR-003 (NDF-RT removed from the source roadmap).

---

## Secrets

| Secret | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | every workflow | auto-provided; used for GHCR push, release PR creation |
| `NPM_TOKEN` | `publish.yml` (npm job) | automation token with publish access to `@melorx` scope |
| `OPENFDA_DATABASE_URL` | `scheduled-ingest-openfda.yml` | **optional**; Postgres DSN for scheduled ingest |

Every secret is injected at the step level, never job level, so its blast
radius is a single step. Fork PRs do not receive secrets — the publish and
scheduled-ingest workflows skip automatically for fork-originated events.

---

## Branch protection recommendations

These are operator-side settings (not code). Recommended configuration on
`main`:

- Require `ci / Test` status check to pass before merging.
- Require at least 1 approving review (CODEOWNERS route).
- Dismiss stale approvals on new commits.
- Require linear history (no merge commits).
- Require branches to be up-to-date before merging.

See `.github/CODEOWNERS` for the paths that require maintainer review.

---

## Dataset versioning

The dataset has its own versioning story driven by what ingested into the
database, not what the code version is. Every API response carries
`meta.dataset_version` reflecting the most recent `pipeline_state.last_ingested_at`
timestamp (format `YYYY-MM-DD`). Downstream callers can detect when the
dataset has changed and re-evaluate cached results.

Dataset changes **do not require a code release.** An ingest run on the 1st
of the month advances `dataset_version` without touching the code or
producing a new Docker image. Correctness fixes to curated pairs or class
rules do require a code release, since those live in `pipeline/sources/`.
