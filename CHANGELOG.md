# Changelog

## [0.4.0](https://github.com/ruhwa-innovation-labs/melorx/compare/melorx-v0.3.0...melorx-v0.4.0) (2026-09-26)


### Features

* **api:** add GET /v1/drugs/resolve and GET /v1/drugs/:rxcui endpoints ([64b7c24](https://github.com/ruhwa-innovation-labs/melorx/commit/64b7c248a63788d3f530e6aa1cb93cb9cae1cbd3))
* **api:** add GET /v1/interactions endpoint with disclaimer enforcement ([75024cf](https://github.com/ruhwa-innovation-labs/melorx/commit/75024cf5d7bf9d6cfd614c8bdff033aa794f2b8a))
* **api:** add Hono app factory and GET /health endpoint ([c6dfc09](https://github.com/ruhwa-innovation-labs/melorx/commit/c6dfc0989bf6e567345b2fcbdd6295ef79a1ecb2))
* **api:** add non-suppressible disclaimer middleware and withDisclaimer helper ([2869610](https://github.com/ruhwa-innovation-labs/melorx/commit/28696101c91c7b5f8135712ef65e191598b31201))
* **api:** add POST /v1/interactions/batch endpoint ([05602b8](https://github.com/ruhwa-innovation-labs/melorx/commit/05602b8323301ca4a0ee7e7662e80d609841c171))
* **api:** Rule [#6](https://github.com/ruhwa-innovation-labs/melorx/issues/6) confidence-gate integration test + CI fixture seed ([ebdd97a](https://github.com/ruhwa-innovation-labs/melorx/commit/ebdd97ad163a1dbbc5839b43f052bd23d553411a))
* **ci,docker:** self-hosted release pipeline (GHCR, npm, release-please) ([4bfb9c9](https://github.com/ruhwa-innovation-labs/melorx/commit/4bfb9c93787a4b04c8ce435e5e46aa3f1116fe83))
* **cli:** @melorx/cli workspace consolidating ingest, promote, review ([81ee8eb](https://github.com/ruhwa-innovation-labs/melorx/commit/81ee8ebebd74bda2e316b1e7bd80d1b5915f50df))
* **client:** @melorx/client typed HTTP client (npm package) ([9dd3746](https://github.com/ruhwa-innovation-labs/melorx/commit/9dd3746cc320115376d0f2fee35fd0fbdeea525e))
* **core:** add drug_interaction_review queue and pipeline_state tables ([6fdccf3](https://github.com/ruhwa-innovation-labs/melorx/commit/6fdccf3b8385ccf5dc0903738d60ab23a2e80911))
* **core:** add shared types, Zod schemas, and logger ([72ecbec](https://github.com/ruhwa-innovation-labs/melorx/commit/72ecbece4c08c9f86ef97ddad8767be7e4e65400))
* **db:** add Drizzle schema and run initial migrations ([be5d7e9](https://github.com/ruhwa-innovation-labs/melorx/commit/be5d7e9ffc7a62f6c1d8023b0107cbccfef05b24))
* ONCHigh class-rule ingestion and query-time class expansion ([2fc95f6](https://github.com/ruhwa-innovation-labs/melorx/commit/2fc95f67a368a936874114f2a1a17e9cf680ff2a))
* **pipeline,api:** NDC ingestion + broaden identifier enrichment + resolve by brand/NDC ([074c1b6](https://github.com/ruhwa-innovation-labs/melorx/commit/074c1b6c1308c3c0978abeb7859fa4b1fdff9b9d))
* **pipeline:** add ONCHigh ETL adapter and seed 5-entry sample dataset ([d8bbfae](https://github.com/ruhwa-innovation-labs/melorx/commit/d8bbfae15ec671b7acd52406630fccda80b8c6a2))
* **pipeline:** community contribution validator and ingest adapter ([4b4106c](https://github.com/ruhwa-innovation-labs/melorx/commit/4b4106c591ce48a464c27678648c01d3c33c17ae))
* **pipeline:** enrich drug_concept with ATC codes and brand names from RxNorm ([9b9b886](https://github.com/ruhwa-innovation-labs/melorx/commit/9b9b8862868078f2820ed2abdc09d3866c92755c))
* **pipeline:** OpenFDA bulk download, NLP extractor, review queue + promote ([72123b3](https://github.com/ruhwa-innovation-labs/melorx/commit/72123b37c2da3ced07da998fc49890c6c14736b2))


### Bug Fixes

* **api:** correct tsx watch argument order in dev script ([5a6be80](https://github.com/ruhwa-innovation-labs/melorx/commit/5a6be803a61ef6d7471c39b74a6b049ecd88ce29))
* **api:** preserve response headers when disclaimer middleware reconstructs response ([c624b41](https://github.com/ruhwa-innovation-labs/melorx/commit/c624b412ed375bc7db10e62c051032a0ba611cc0))
* **config:** fail fast when DATABASE_URL is missing ([20f7e1d](https://github.com/ruhwa-innovation-labs/melorx/commit/20f7e1d8dadac0bf9c09f1446b378cb465a3f921))
* **core:** add @types/node, derive SOURCE_TYPES from shared constant, use z.string().date() for accessed_date ([6d02aae](https://github.com/ruhwa-innovation-labs/melorx/commit/6d02aae6ef4341ba4a58d6b21befb7e4f87ac2ed))
* **db:** add JSONB type parameters, notNull on drugClass and isGenerated, fast-fail in createDb ([1a7ca53](https://github.com/ruhwa-innovation-labs/melorx/commit/1a7ca538e699173081be24d883193a0251cdb399))
* **pipeline:** graceful pool teardown in seed, tighten TransformedEntry.sources type ([d9a8e96](https://github.com/ruhwa-innovation-labs/melorx/commit/d9a8e96b9cdb973b824b7b205aaf5b22c5b7479b))


### Documentation

* add README and Apache 2.0 LICENSE ([a4dde3c](https://github.com/ruhwa-innovation-labs/melorx/commit/a4dde3c3cc1c6276a8ad5624be7ac83da580f726))
* initialize Core-to-Shell project definition and full documentation suite ([acd306d](https://github.com/ruhwa-innovation-labs/melorx/commit/acd306da4d490fa581cc9e5c8db270181f4a606e))
* move manual testing guide to test-version-docs/v0.1.md ([51b7617](https://github.com/ruhwa-innovation-labs/melorx/commit/51b7617d842d8790900a74626cb296b024d352af))
* **plans:** record OpenFDA NLP extraction approach as ADR-004 ([1b18bc3](https://github.com/ruhwa-innovation-labs/melorx/commit/1b18bc358da7db97dfab7926839980bac981aecf))
* record NDF-RT pivot as ADR-003 and update v0.2 roadmap ([f114a9b](https://github.com/ruhwa-innovation-labs/melorx/commit/f114a9b5632fc789184c4f517a671c657a2cf76a))
* v0.3 manual testing guide ([2c5b0a4](https://github.com/ruhwa-innovation-labs/melorx/commit/2c5b0a477d17023228871b0fb73de84565010275))
