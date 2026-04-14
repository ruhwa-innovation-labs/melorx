# Environment Variables

All environment variables used by melo-rx. Never commit actual `.env` files. This document describes the shape and source of each variable only.

---

## Reference

| Variable | Required / Optional | Source | Default | What It Controls |
|----------|-------------------|--------|---------|-----------------|
| `DATABASE_URL` | Required | `.env` | — | PostgreSQL connection string. Format: `postgres://user:pass@host:5432/melo_rx` |
| `DATABASE_POOL_SIZE` | Optional | `.env` | `10` | Maximum number of concurrent database connections in the pool |
| `RXNORM_API_BASE` | Optional | `.env` | `https://rxnav.nlm.nih.gov/REST` | Base URL for the NLM RxNorm REST API, used by the resolver service for identifier lookups |
| `RXNORM_RATE_LIMIT_RPS` | Optional | `.env` | `20` | Maximum requests per second sent to the NLM RxNorm API to avoid throttling |
| `API_PORT` | Optional | `.env` | `3000` | Port the Hono HTTP server listens on |
| `API_KEY_SECRET` | Optional | `.env` | — | Secret used to hash API keys. Required when `HOSTED_MODE=true`; has no effect when hosted mode is disabled |
| `HOSTED_MODE` | Optional | `.env` | `false` | When `true`, enables per-key rate limiting and API key validation. Intended for the public hosted demo; self-hosted deployments should leave this `false` |
| `OPENFDA_DOWNLOAD_URL` | Optional | `.env` | `https://api.fda.gov/download.json` | URL of the OpenFDA bulk download manifest, used by the OpenFDA pipeline adapter |
| `NLP_CONFIDENCE_THRESHOLD` | Optional | `.env` | `0.75` | Minimum confidence score (0.0–1.0) for NLP-extracted interaction pairs to be served in API responses. Pairs below this threshold are held for manual review |
| `LOG_LEVEL` | Optional | `.env` | `info` | Logging verbosity. Accepted values: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | Optional | System | `development` | Affects log output format (JSON in production, human-readable in development) and the level of error detail included in API responses |

---

## Notes

- `DATABASE_URL` is the only variable with no default. The application will refuse to start if it is missing or malformed.
- `API_KEY_SECRET` should be a cryptographically random string of at least 32 characters. Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `NLP_CONFIDENCE_THRESHOLD` does not affect curated pairs (those with `confidence: null`). It filters only NLP-extracted pairs sourced from the OpenFDA pipeline.
- Never commit actual `.env` files. Add `.env` to `.gitignore` and document only the shape and source of each variable here.

---

## .env.example

The following is the canonical `.env.example` file. Copy it to `.env` and replace placeholder values before running the project locally.

```dotenv
# -------------------------------------------------------
# melo-rx environment configuration
# Copy this file to .env and fill in required values.
# Never commit .env to version control.
# -------------------------------------------------------

# Required — PostgreSQL connection string
DATABASE_URL=postgres://melo:melo@localhost:5432/melo_rx

# Optional — database connection pool
DATABASE_POOL_SIZE=10

# Optional — NLM RxNorm API
RXNORM_API_BASE=https://rxnav.nlm.nih.gov/REST
RXNORM_RATE_LIMIT_RPS=20

# Optional — API server
API_PORT=3000

# Optional — hosted mode (set to true only for the public demo deployment)
# API_KEY_SECRET=replace-with-a-32-char-random-string
HOSTED_MODE=false

# Optional — OpenFDA pipeline
OPENFDA_DOWNLOAD_URL=https://api.fda.gov/download.json

# Optional — NLP confidence filtering
NLP_CONFIDENCE_THRESHOLD=0.75

# Optional — logging
LOG_LEVEL=info

# Optional — set by the system in production; leave unset locally
# NODE_ENV=production
```
