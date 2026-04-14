# Git Workflow

---

## Branch Naming

All branches must be prefixed with one of the following types:

| Prefix | When to use |
|--------|------------|
| `feat/` | New feature or API endpoint |
| `fix/` | Bug fix |
| `data/` | Dataset additions or corrections (new interaction pairs, ONCHigh updates) |
| `pipeline/` | Changes to ingestion adapters or the resolver |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependency updates, CI config, build changes |

Examples:

```
feat/batch-interactions-endpoint
fix/resolver-ndc-lookup-null
data/onchigh-seed-v0.1
pipeline/openfda-nlp-adapter
docs/api-reference
chore/upgrade-drizzle-0.31
```

Branch names should be lowercase with hyphens. No spaces, no special characters.

---

## Commit Message Format

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

**Format:**

```
type(scope): description
```

The description is lowercase and does not end with a period. Keep it under 72 characters. If context is needed, add a body after a blank line.

**Types and scopes:**

| Type | Use for |
|------|---------|
| `feat` | New features |
| `fix` | Bug fixes |
| `data` | Dataset changes |
| `pipeline` | Ingestion pipeline changes |
| `docs` | Documentation |
| `chore` | Tooling, CI, dependencies |
| `test` | Test additions or corrections |
| `refactor` | Code changes that are neither a fix nor a feature |

Valid scopes match the package or area being changed: `api`, `core`, `cli`, `client`, `pipeline`, `db`, `resolver`, `onchigh`, `openfda`, `ndf-rt`.

**Examples:**

```
feat(api): add batch interaction endpoint
fix(resolver): handle retired RxCUI redirect chains
data(onchigh): seed v0.1 437 pairs
pipeline(openfda): add NLP confidence scoring
chore(ci): add pnpm audit step to PR workflow
test(core): add unit tests for severity mapping
docs(api): document /v1/interactions response envelope
```

---

## Pull Request Process

1. Branch from `main`.
2. Open a PR with a description that answers:
   - What changed?
   - Why was this change needed?
   - Are there any follow-up tasks or known limitations?
3. CI must pass before the PR can be merged. CI checks are:
   - `pnpm test` — full test suite
   - `pnpm typecheck` — TypeScript compilation with no errors
   - `pnpm lint` — ESLint with no errors
4. All PRs are merged via **squash merge** to keep `main` history clean and linear.
5. Delete the branch after merge.

PRs that modify core business rules (severity mapping, disclaimer middleware, source citation schema) require a second reviewer before merge.

---

## Community Data Contribution PRs

PRs that add or modify interaction data in `pipeline/sources/community/` have additional requirements:

- **Source citation:** The `sources[]` field must include at least one entry with a valid `url`, `name`, `type`, and `accessed` date. Acceptable `source_type` values: `clinical_guideline`, `fda_label`, `peer_reviewed_study`, `clinical_pharmacist_review`.
- **Severity rationale:** The PR description must explain why the submitted severity level is correct, referencing the cited source.
- **Schema validation:** The CI JSON schema validator check must pass. Submissions that fail schema validation are not reviewed until the schema errors are fixed.
- **No duplicate pairs:** CI deduplication check must confirm the pair does not already exist in the dataset.

---

## Release Tagging

Releases follow [Semantic Versioning](https://semver.org/):

```
v0.1.0
v0.2.0
v1.0.0
```

- A new tag is created from `main` after the relevant milestone is complete.
- Every release tag corresponds to a GitHub Release with a changelog.
- Dataset versions are tracked separately in `DATASET_CHANGELOG.md` in the repo root. The dataset version and the software version are independent; a dataset-only update increments the dataset version without requiring a software release.

---

## What to Never Commit

The following must never appear in the repository:

- `.env` files containing real credentials or connection strings
- Actual API keys, tokens, or secrets of any kind
- Any patient data, PII, or PHI — the API operates only on drug identifiers, never patient identifiers
- Data files licensed under CC BY-NC (including SIDER, DrugBank exports) — these would contaminate the Apache 2.0 dataset license

If you accidentally commit a secret, treat it as compromised immediately: rotate the credential, then use `git filter-repo` or contact a maintainer to scrub the history.
