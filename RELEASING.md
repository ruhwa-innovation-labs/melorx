# Releasing

Quick reference for maintainers cutting a release.

---

## TL;DR

1. Land PRs with Conventional Commits on `main`.
2. Merge the release PR that `release-please` keeps open on `main`.
3. `publish.yml` runs automatically — npm and GHCR receive the new artefacts.
4. Verify with `npm view @melorx/client dist-tags` and `docker pull`.

---

## Prerequisites (one-time)

- [ ] **npm org `@melorx` exists** and you are a maintainer on it. Create it at <https://www.npmjs.com/org/create> if it doesn't.
- [ ] **Repository secret `NPM_TOKEN`** is set — an **automation** token from `npmjs.com/settings/<your-handle>/tokens` with publish scope on `@melorx/client`. Classic publish tokens do not work with `--provenance`; use a granular or automation token.
- [ ] **GHCR package visibility** is set to public (GitHub → Packages → `melorx` → Package settings). First push after creating the repo defaults to private.
- [ ] **GITHUB_TOKEN default permissions** include "Read and write" (Settings → Actions → General → Workflow permissions). `release-please` needs this to open its release PR.
- [ ] Branch protection on `main`: require the `CI / Test` check.

---

## Normal release flow

### 1. Land features

Every PR into `main` uses Conventional Commits:

```
feat(api): add POST /v1/interactions/batch endpoint
fix(resolver): handle NDC with leading zero correctly
feat!: drop the legacy /v1/drug endpoint
```

`feat` → minor bump. `fix` → patch. `!` or `BREAKING CHANGE:` → major.

### 2. Watch the release PR

`release-please.yml` runs on every push to `main` and keeps an open PR
titled `chore(main): release <version>` (one per versioned package:
`melorx` for the app, `client` for the SDK). Don't edit the PR's body —
release-please rewrites it on every push.

### 3. Decide which package to release

The release PR stages both package bumps together by default. If you only
want to release one, close the other's section of the PR (edit the
changelog entries) or wait until the next open.

### 4. Merge

Merge the release PR with **"Squash and merge"** (release-please generates a
single commit). This creates:

- Git tags (`client-vX.Y.Z`, `melorx-vX.Y.Z`)
- GitHub Releases with the CHANGELOG entries attached
- A `release.published` event that fires `publish.yml`

### 5. Verify

```bash
# npm — client release
npm view @melorx/client dist-tags
# → { latest: '0.3.0', next: '0.3.0-rc.1' }

# Docker — app release
docker pull ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0
docker pull ghcr.io/ruhwa-innovation-labs/melorx:latest
docker inspect ghcr.io/ruhwa-innovation-labs/melorx:v0.3.0 \
  | jq '.[0].Config.Labels'
```

Both should succeed. If either fails, check the Actions tab for the
`publish.yml` run.

---

## Manually re-running a publish

If `publish.yml` fails and you need to retry:

```text
Actions → Publish → Run workflow → Inputs → tag: client-v0.3.0
```

It's safe to re-run for an already-published version:

- **npm** — `npm publish` will fail with `E403` on re-publish. This is
  expected; fix what's broken, bump the version in a new PR, let
  release-please open a new release PR.
- **Docker** — GHCR accepts re-push for identical content; tags simply
  overwrite. A re-run after a transient failure is idempotent.

---

## Pre-release (`next` tag)

If a commit bumps the version to something like `0.4.0-rc.1` (via a
release-please-included `extra-files` override or a manual manifest edit),
the publish workflow detects the `-` suffix and publishes to npm under the
`next` dist-tag rather than `latest`. Docker gets the same behaviour —
`:next` tag instead of `:latest`.

Clients test it with:

```bash
pnpm add @melorx/client@next
docker pull ghcr.io/ruhwa-innovation-labs/melorx:next
```

Promoting a pre-release to stable is handled by bumping to a non-pre-release
version in the normal flow.

---

## First-ever release (v0.3.0)

The manifest is seeded at `0.3.0` for both packages. After landing this PR:

1. Push at least one Conventional Commit to `main` after the release
   setup merges (e.g. the release setup itself qualifies as `chore(ci): …`).
2. `release-please.yml` opens a release PR within a minute.
3. Merge it — the first tags (`client-v0.3.0`, `melorx-v0.3.0`) are
   created.
4. `publish.yml` publishes both artefacts.

If you'd rather the first release be `v1.0.0`, edit
`.release-please-manifest.json` to set both packages to the preceding
version (`0.9.0`) and add a `Release-As: 1.0.0` footer in your next commit.

---

## Unreleasing

Mistakes happen. How to back out:

- **npm** — `npm deprecate @melorx/client@<version> "Deprecated, use vX.Y.Z"`.
  You cannot fully unpublish after 72 hours — deprecate + release a fixed
  version.
- **Docker (GHCR)** — `gh api -X DELETE /user/packages/container/melorx/versions/<id>`
  (requires `packages:write`). For public packages consumed elsewhere,
  consider leaving the image and releasing a fixed tag instead.
- **Tags + GitHub Release** — delete via the GitHub UI or `gh release delete`.
  Update release-please's manifest to reflect the rolled-back state in a
  follow-up PR; otherwise it will try to re-cut the same version.

---

## Dataset releases (no code change)

Dataset-only releases don't use release-please. The `dataset_version` on
every API response is derived at query time from
`pipeline_state.last_ingested_at`. To advertise a dataset refresh:

1. Run `pnpm cli ingest all` against the target DB (manually or via
   `scheduled-ingest-openfda.yml`).
2. Run `pnpm db:promote`.
3. No code release is needed. Operators pick up the new data on their next
   query.

If you want to document a notable dataset change (a removed pair, a
severity correction, a new source), append to `docs/DATASET_CHANGELOG.md`
(not yet present — create it on the first dataset-only release).
