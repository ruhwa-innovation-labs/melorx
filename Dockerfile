# syntax=docker/dockerfile:1.7

# ------------------------------------------------------------------------------
# melorx production image
# ------------------------------------------------------------------------------
#
# Runtime: Node.js 22 (Alpine).
# Entrypoint: Hono API, started via tsx so workspace TypeScript packages
#   (@melorx/core, @melorx/pipeline) resolve without a separate build step.
#   tsx caches transpiled modules per-run so steady-state performance matches
#   node + compiled .js.
#
# The image also contains drizzle-kit and the full migrations directory so
# operators can run schema migrations from the same image they deploy:
#
#     docker run --rm -e DATABASE_URL=... ghcr.io/.../melorx:<tag> pnpm db:migrate
#
# then restart the API container with the new image tag.
#
# This image does NOT include the RxNorm RRF source files (too large, and
# licensed separately). Operators who need to run `pnpm db:seed:classes` or
# `pnpm db:enrich` must mount the RRF files into /app/pipeline/resolver/raw.
# ------------------------------------------------------------------------------

FROM node:26-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache tini

WORKDIR /app

# Copy only the manifests first so dependency install is cached independently
# of source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json       packages/api/package.json
COPY packages/cli/package.json       packages/cli/package.json
COPY packages/client/package.json    packages/client/package.json
COPY packages/core/package.json      packages/core/package.json
COPY pipeline/package.json           pipeline/package.json

RUN pnpm install --frozen-lockfile --prefer-offline

# ------------------------------------------------------------------------------

FROM node:26-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache tini curl

# Run as a non-root user.
RUN addgroup -S melo && adduser -S melo -G melo
WORKDIR /app

# Bring in resolved node_modules from the deps stage, then copy source.
COPY --from=deps /app/node_modules              ./node_modules
COPY --from=deps /app/packages                  ./packages
COPY --from=deps /app/pipeline/node_modules     ./pipeline/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json                               ./
COPY drizzle.config.ts                                ./
COPY db/                                              ./db/
COPY packages/api/                                    ./packages/api/
COPY packages/cli/                                    ./packages/cli/
COPY packages/core/                                   ./packages/core/
COPY packages/client/                                 ./packages/client/
COPY pipeline/                                        ./pipeline/

# Allow the non-root user to read everything it needs.
RUN chown -R melo:melo /app

USER melo

ENV NODE_ENV=production \
    API_PORT=3000 \
    LOG_LEVEL=info

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${API_PORT}/health || exit 1

# tini reaps zombie processes when pnpm forks subprocesses for db:migrate etc.
ENTRYPOINT ["/sbin/tini", "--"]

# Default command: start the API. Override with e.g. `pnpm db:migrate`.
CMD ["pnpm", "--filter", "@melorx/api", "exec", "tsx", "src/index.ts"]
