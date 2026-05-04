# Coding Standards

These standards apply across all packages in the melo-rx monorepo. They are enforced in code review and where possible via lint rules and CI checks.

---

## Language Rules

These are non-negotiable. PRs that violate them are blocked regardless of functionality.

**No `any`.**
Use `unknown` and narrow with Zod schemas or TypeScript type guards. If the shape of an external value is genuinely unknown, validate it through a Zod schema before using it.

```typescript
// bad
function parseLabel(data: any) { ... }

// good
function parseLabel(data: unknown) {
  const parsed = drugLabelSchema.parse(data);
  ...
}
```

**No implicit returns in async functions.**
Every async function must either return a value explicitly or throw. Never rely on an implicit `undefined` return from a function that callers expect to resolve to a value.

**No magic numbers or strings.**
Define constants in `packages/core/src/constants.ts`. If you are typing the same literal value more than once, it belongs in constants.

```typescript
// bad
if (confidence < 0.75) { ... }

// good
import { NLP_CONFIDENCE_THRESHOLD } from '@melo-rx/core/constants';
if (confidence < NLP_CONFIDENCE_THRESHOLD) { ... }
```

**Severity values must always use the `Severity` enum from `packages/core`.**
Never hardcode severity strings (`"moderate"`, `"serious"`, etc.) in application code. Import and use the enum.

```typescript
// bad
return { severity: 'serious' };

// good
import { Severity } from '@melo-rx/core';
return { severity: Severity.Serious };
```

**All external input must be validated with Zod before use.**
This includes API request bodies and query parameters, pipeline source files (XML, JSON, CSV), and community-contributed JSON data. Validation happens at the boundary — before any business logic runs.

---

## Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `drug-interaction.service.ts` |
| Classes | PascalCase | `DrugResolver` |
| Functions and methods | camelCase | `resolveRxCui` |
| Constants | SCREAMING_SNAKE_CASE | `NLP_CONFIDENCE_THRESHOLD` |
| Database columns | snake_case | `drug1_rxcui` |
| Zod schemas | camelCase + `Schema` suffix | `drugInteractionSchema` |
| TypeScript types and interfaces | PascalCase | `DrugConcept` |

---

## Required Patterns

**Service layer separation.**
Service files (`*.service.ts`) must not import from the HTTP layer. Hono route handlers import services; services never import handlers. This keeps business logic testable in isolation without spinning up an HTTP server.

**All database queries go through Drizzle.**
No raw SQL in application code. The only exception is migration files in `db/migrations/`, which are plain SQL by design and should remain readable without ORM knowledge.

**Pipeline adapters must implement `SourceAdapter`.**
Every ingestion adapter in `pipeline/sources/` must implement the `SourceAdapter` interface exported from `packages/core`. This enforces a consistent contract: `load()`, `parse()`, and `transform()` stages that the pipeline runner can call uniformly.

**Every HTTP handler must validate input first.**
Call `validateInput(schema, data)` (or `schema.parse(data)`) before executing any business logic. Query parameters, path parameters, and request bodies all count as external input.

```typescript
// good — validation before business logic
app.get('/v1/interactions', async (c) => {
  const query = interactionQuerySchema.parse(c.req.query());
  const result = await interactionService.getInteraction(query.drug1, query.drug2);
  return c.json(result);
});
```

---

## Anti-Patterns

**`console.log` in production code.**
Use the structured logger exported from `packages/core`. It respects `LOG_LEVEL`, outputs JSON in production, and never includes patient data.

```typescript
// bad
console.log('Resolved RxCUI:', rxcui);

// good
import { logger } from '@melo-rx/core';
logger.debug({ rxcui }, 'Resolved RxCUI');
```

**Mutating function parameters.**
Always return new objects. Mutations make data flow impossible to trace and cause subtle bugs in pipelines that re-use parsed objects.

```typescript
// bad
function normalize(interaction: DrugInteraction) {
  interaction.severity = mapSeverity(interaction.severity);
  return interaction;
}

// good
function normalize(interaction: DrugInteraction): DrugInteraction {
  return { ...interaction, severity: mapSeverity(interaction.severity) };
}
```

**Synchronous file reads in the API hot path.**
Use async `fs.promises` or, for files that are needed on every request, pre-load them at startup into memory. Blocking the event loop in the hot path kills p99 latency.

**`process.exit()` outside CLI entry points.**
Only `packages/cli` entry points may call `process.exit()`. Application code and services must throw errors and let the caller decide how to handle them.

---

## Code Review Checklist

Before marking a PR ready for review, confirm every item:

- [ ] No `any` types introduced
- [ ] All new environment variables documented in [environment-variables.md](./environment-variables.md)
- [ ] Zod schema created for any new external input shape
- [ ] New interaction source citations validated against the `sources[]` schema
- [ ] Disclaimer middleware has not been bypassed or modified
- [ ] License of any new data source verified as Apache 2.0-compatible (not CC BY-NC or proprietary)
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm typecheck`
