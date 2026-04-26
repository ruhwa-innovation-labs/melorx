# @melorx/client

Typed HTTP client for the [melorx](https://github.com/ruhwa-innovation-labs/melorx) drug-drug
interaction API. Pure HTTP — no database driver, no server runtime, no native modules. Runs in
Node.js 18+, modern browsers, and edge runtimes (Cloudflare Workers, Deno, Bun).

> **NOT FOR CLINICAL DECISION-MAKING.** melorx is an informational reference tool. Every
> response from the interaction endpoints carries a non-suppressible `disclaimer` string.
> Do not use this library as a substitute for clinical judgement.

## Install

```sh
pnpm add @melorx/client
```

## Quick start

```ts
import { createClient } from '@melorx/client'

const melo = createClient({ baseUrl: 'https://demo.melorx.com' })

const result = await melo.checkInteraction('ibuprofen', 'lisinopril')

console.log(result.data.interactions[0]?.severity) // "moderate"
console.log(result.disclaimer)                     // non-suppressible
```

## API

### `createClient(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | — (required) | Root URL of a melorx API, e.g. `http://localhost:3000` |
| `apiKey` | `string` | `undefined` | Attached as `x-api-key` header when present |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |
| `timeoutMs` | `number` | `10000` | Per-request timeout |
| `maxRetries` | `number` | `3` | Retries for `5xx` responses |
| `retryBaseDelayMs` | `number` | `200` | Starting delay for exponential backoff |
| `headers` | `Record<string,string>` | `{}` | Extra headers merged into every request |

### Methods

```ts
melo.checkInteraction(drug1, drug2, overrides?)       // → InteractionResponse
melo.checkInteractionsBatch(pairs, overrides?)        // → BatchInteractionResponse
melo.resolveDrug(query, overrides?)                   // → DrugResponse
melo.getDrug(rxcui, overrides?)                       // → DrugResponse
```

Every method accepts an optional `{ signal, headers }` overrides object for
`AbortSignal` passthrough or per-request headers.

### Errors

All library-thrown errors inherit from `MelorxError` so you can branch by class:

```ts
import { DrugNotFoundError, RateLimitError, ServerError } from '@melorx/client'

try {
  await melo.checkInteraction('notadrug', 'aspirin')
} catch (err) {
  if (err instanceof DrugNotFoundError) {
    console.log(`could not resolve: ${err.drug}`)
  } else if (err instanceof RateLimitError) {
    console.log(`retry after ${err.retryAfterSeconds}s`)
  } else if (err instanceof ServerError) {
    console.log(`upstream ${err.status}`)
  }
}
```

`DrugNotFoundError`, `ValidationError`, `RateLimitError`, `ServerError`,
`NetworkError`, and `TimeoutError` are all exported.

## Retries and backoff

- `5xx` responses are retried with exponential backoff up to `maxRetries`.
- `4xx` responses are never retried.
- The retry sleep is abortable via the caller's `AbortSignal`.

## License

Apache-2.0. See the project root for the `NOTICE` file.
