# Monitoring and Observability

## Health Check

```
GET /health
```

Returns the operational status of the API and its database connection. Used by Fly.io as the
liveness probe and by operators for uptime monitoring.

**Response (healthy):**

```json
{
  "status": "ok",
  "db": "connected",
  "version": "1.0.0"
}
```

**Response (unhealthy — database unreachable):**

```json
{
  "status": "error",
  "db": "disconnected",
  "version": "1.0.0"
}
```

HTTP status code is `200` when healthy and `503` when any dependency is unhealthy. Monitoring
systems should check the status code, not just the response body.

The `/health` endpoint does not require authentication and is not rate-limited. It is
intentionally lightweight — it executes a single `SELECT 1` against the database to verify
connectivity and returns immediately.

---

## Metrics

```
GET /metrics
```

Returns Prometheus text format metrics. Intended for scraping by a Prometheus instance or
any compatible collector (Grafana Agent, OpenTelemetry Collector, Datadog Agent with
Prometheus scraping enabled).

The endpoint does not require authentication on self-hosted deployments. On the hosted demo,
it is restricted to localhost to prevent public exposure of operational data.

### Available Metrics

**`http_requests_total`** — Counter

Total number of HTTP requests received.

Labels: `method` (GET, POST), `path` (normalized, e.g., `/v1/interactions`), `status`
(HTTP status code).

```
http_requests_total{method="GET",path="/v1/interactions",status="200"} 14523
http_requests_total{method="GET",path="/v1/interactions",status="404"} 87
http_requests_total{method="POST",path="/v1/interactions/batch",status="200"} 342
```

---

**`http_request_duration_seconds`** — Histogram

Request duration in seconds, from the time the request is received to the time the response
is fully sent.

Labels: `method`, `path`.

Buckets: `0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2.5, 5`.

The p99 target for self-hosted warm queries is under 20ms. The `0.025` bucket (25ms) is the
primary operational threshold to watch.

---

**`db_query_duration_seconds`** — Histogram

Duration of individual database queries in seconds.

Labels: `query_type` (e.g., `interaction_lookup`, `drug_resolve`, `batch_lookup`).

Useful for identifying when database performance degrades independently of HTTP handler
overhead — for example, when a class-expansion query starts hitting unindexed paths as the
dataset grows.

---

**`drug_interaction_lookups_total`** — Counter

Total number of drug interaction lookup queries executed.

Labels: `result` (`found` | `not_found`).

```
drug_interaction_lookups_total{result="found"} 12840
drug_interaction_lookups_total{result="not_found"} 1683
```

A rising `not_found` rate may indicate that users are querying for drugs not yet in the
dataset, which is useful signal for prioritizing ingestion work. A `not_found` result is not
an error — the API returns a valid empty interactions array.

---

**`disclaimer_injections_total`** — Counter

Total number of times the disclaimer middleware has injected the disclaimer field into a
response. This counter must equal the total number of successful responses from any
`/v1/interactions*` endpoint. A delta between this counter and `http_requests_total` for
`/v1/interactions` paths indicates a middleware configuration error.

```
disclaimer_injections_total 15207
```

---

## Logging

Structured JSON logs are emitted via pino to stdout. The log format is compatible with
common log aggregators (Datadog, Loki, CloudWatch Logs, Fly.io log shipping).

### Log Levels

| Level | Condition |
|-------|-----------|
| `error` | 5xx responses; uncaught exceptions; database connection failures |
| `warn` | 4xx responses on `/v1/` routes; ingestion pipeline warnings |
| `info` | Server startup; ingestion pipeline start/complete; graceful shutdown |
| `debug` | Disabled in production; available in development via `LOG_LEVEL=debug` |

### Log Fields

Every request log entry includes:

```json
{
  "level": "info",
  "time": 1744617600000,
  "msg": "request completed",
  "method": "GET",
  "url": "/v1/interactions",
  "statusCode": 200,
  "responseTime": 4,
  "drug1": "5640",
  "drug2": "29046"
}
```

Drug identifiers are logged as resolved RxCUI values, not as the raw user input. This means
a request for `?drug1=ibuprofen&drug2=lisinopril` is logged with `"drug1": "5640"` and
`"drug2": "29046"` after resolution.

Request logs do not include IP addresses (stripped at ingress on the hosted demo), API key
values, or any patient-identifiable information. See [Security Overview](../security/overview.md)
for the full no-PHI logging policy.

### Ingestion Pipeline Logs

The ingestion pipeline emits `info`-level logs for each major phase:

```json
{"level":"info","msg":"ingestion started","source":"openfda","run_id":"uuid"}
{"level":"info","msg":"checksum verified","source":"openfda","file":"drug-label.zip"}
{"level":"info","msg":"ingestion complete","source":"openfda","pairs_ingested":342,"pairs_rejected":18,"duration_ms":84200}
```

Errors during ingestion are logged at `error` level with full stack traces.

---

## Alerting Recommendations for Self-Hosters

These are recommendations, not requirements. Adapt thresholds to your traffic volume and
availability requirements.

| Alert | Condition | Suggested Threshold |
|-------|-----------|-------------------|
| High error rate | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01` | Error rate above 1% over 5 minutes |
| High p99 latency | `histogram_quantile(0.99, http_request_duration_seconds_bucket) > 0.2` | p99 above 200ms |
| Database connection failure | `db_query_duration_seconds` stops reporting or health check returns `db: disconnected` | Any occurrence |
| Disclaimer injection mismatch | `disclaimer_injections_total` diverges from successful `/v1/interactions*` request count | Any delta |
| Ingestion pipeline failure | Pipeline run exits non-zero; no new row in `pipeline_run` table after scheduled run time | 2+ hours after scheduled run |

For the hosted demo, Fly.io's built-in health check alerting covers the database connectivity
and container restart scenarios. External uptime monitoring (e.g., Better Uptime, UptimeRobot)
against `GET /health` provides an independent availability signal.

---

## Ingestion Pipeline Monitoring

The ingestion pipeline records metadata for every run in the `pipeline_run` table:

```sql
CREATE TABLE pipeline_run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        VARCHAR NOT NULL,          -- 'openfda' | 'ndf-rt' | 'onc-high'
  pairs_ingested INTEGER NOT NULL,
  pairs_rejected INTEGER NOT NULL,
  errors        JSONB,                     -- NULL if no errors; array of error objects otherwise
  duration_ms   INTEGER,
  status        VARCHAR NOT NULL           -- 'success' | 'partial' | 'failed'
);
```

The CLI exposes a `pipeline:runs` command for inspecting run history:

```bash
pnpm cli pipeline:runs --limit 10
pnpm cli pipeline:runs --source openfda --since 2026-01-01
```

A `status` of `partial` means the pipeline completed but some pairs were rejected (e.g., due
to failed source citation validation or confidence below the 0.75 threshold). The `errors`
field contains details. A `status` of `failed` means the pipeline aborted before completion;
no new data was committed.

Operators should monitor for `failed` runs after each scheduled ingestion date and investigate
the `errors` field before the next scheduled run.
