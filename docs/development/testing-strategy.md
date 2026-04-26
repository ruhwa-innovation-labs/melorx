# Testing Strategy

---

## Philosophy

Integration tests are the canonical correctness signal for the API. A passing integration test against a real seeded database means the full stack — Zod validation, Drizzle queries, severity mapping, disclaimer injection — works end-to-end. Unit tests cover pure business logic (the resolver, severity mapping, NLP confidence scoring) where the logic is complex enough to warrant isolated verification.

The goal is confidence, not coverage theater. A test that proves the `/v1/interactions` endpoint returns the right severity for a known pair is worth more than ten tests that assert on internal implementation details.

---

## Test Runner

[Vitest](https://vitest.dev/) — native ESM, first-class TypeScript, fast watch mode.

Run all tests:

```bash
pnpm test
```

Run with coverage:

```bash
pnpm test --coverage
```

Run a specific package:

```bash
pnpm --filter @melorx/api test
pnpm --filter @melorx/core test
```

---

## Test Structure

```
packages/
  api/
    src/
      __tests__/           # HTTP integration tests
  core/
    src/
      __tests__/           # Unit tests
pipeline/
  sources/
    __tests__/             # ETL adapter unit tests
```

### packages/api/src/\_\_tests\_\_/

HTTP integration tests using the Hono test client and a real seeded database.

These tests exercise the full request-response cycle: routing, Zod input validation, the service layer, database queries, and the disclaimer middleware. Each test file operates within a database transaction that rolls back after the test — no test leaves data behind.

Example of what lives here:
- `interactions.test.ts` — verifies that known ONCHigh pairs return the correct severity, mechanism, sources, and disclaimer field
- `batch.test.ts` — verifies the batch endpoint accepts multiple pairs and returns the correct structure
- `health.test.ts` — verifies the `/health` endpoint returns `{"status":"ok"}`
- `resolver.test.ts` — verifies drug name and NDC resolution through the API

### packages/core/src/\_\_tests\_\_/

Unit tests for pure business logic — no HTTP, no database.

These tests are fast and should be run frequently during development. They cover:
- Resolver logic: RxCUI normalization, retired CUI chain handling
- Severity mapping: source-specific values mapping to the canonical `Severity` enum
- NLP confidence scoring: threshold filtering, edge cases around `null` confidence on curated pairs
- Zod schema validation: that malformed inputs are rejected with the expected errors

### pipeline/sources/\_\_tests\_\_/

Unit tests for ETL adapter parsing logic with mocked file I/O.

These tests verify that the parsing and transform stages of each adapter produce correctly shaped output. File reads are mocked; the parsing logic itself runs against real (but small) fixture data extracted from each source.

---

## Coverage Targets

| Package | Target | Priority |
|---------|--------|----------|
| `packages/core` | 80% line coverage | All logic branches in resolver and severity mapping |
| `packages/api` | 80% line coverage | All endpoint handlers and middleware |
| `pipeline/sources` | 60% line coverage | Parsing logic is the priority; ingestion orchestration is lower priority |

Coverage is measured with `pnpm test --coverage`. The CI check fails if `packages/core` or `packages/api` fall below 80% line coverage.

---

## Database Testing

**Requirement:** Docker must be running before executing the test suite.

In CI, the test database is the same PostgreSQL 16 service defined in `docker-compose.yml`. The CI workflow:

1. Starts the `db` service via `docker compose up -d db`
2. Waits for the health check to pass
3. Runs Drizzle migrations: `pnpm db:migrate`
4. Seeds ONCHigh fixture data: `pnpm db:seed`
5. Runs `pnpm test --coverage`

**Transaction isolation per test file:**

Each integration test file wraps its tests in a database transaction that is rolled back after all tests in that file complete. This means:

- Tests never pollute each other's data
- The seed data is always the starting state for every test file
- No `beforeEach` cleanup queries are needed

This is implemented via a shared `createTestContext()` helper in `packages/api/src/__tests__/helpers/db.ts` that opens a transaction, exposes the transaction client to the test, and rolls back in `afterAll`.

---

## What NOT to Mock

**The database.**
Integration tests in `packages/api` run against a real PostgreSQL instance. Mocking the database in integration tests defeats their entire purpose: verifying that queries, migrations, and seed data all work together correctly.

**Zod schemas.**
Zod schemas are the contract between the outside world and the application. Never mock them. If a schema rejects input in a test, the test is showing you a real problem.

**The `Severity` enum.**
Severity values must always flow through the canonical enum. Tests that hardcode string literals for severity comparisons are masking potential mapping bugs.

---

## What to Mock

**NLM RxNorm API calls.**
Use [msw (Mock Service Worker)](https://mswjs.io/) to intercept outbound HTTP requests to `RXNORM_API_BASE` in tests. This prevents test suite execution from depending on external network availability and makes tests deterministic.

Fixtures live in `packages/api/src/__tests__/fixtures/rxnorm/`. Add a fixture file for each RxCUI that a test depends on.

**OpenFDA bulk downloads.**
The OpenFDA pipeline adapter reads from local fixture files during tests. Place small representative drug label extracts in `pipeline/sources/__tests__/fixtures/openfda/`. The adapter's file I/O is mocked to return these fixtures instead of downloading from the network.

---

## CI Check

The following command must pass before any merge to `main`:

```bash
pnpm test --coverage
```

This runs the full test suite across all packages, generates coverage reports, and fails the CI job if coverage falls below the defined thresholds. Type checking runs separately but is also required:

```bash
pnpm typecheck
```

Both checks are defined in `.github/workflows/ci.yml` and run on every PR targeting `main`.
