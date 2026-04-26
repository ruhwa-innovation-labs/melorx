import { describe, it, expect, beforeAll } from 'vitest'
import { createDb } from '@melorx/core'
import { createApp } from '../app.js'

describe('GET /v1/drugs/resolve', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(() => {
    app = createApp(createDb(process.env['DATABASE_URL']!))
  })

  it('resolves an exact RxCUI to a drug concept', async () => {
    const res = await app.request('/v1/drugs/resolve?q=5640')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rxcui: string; name: string } }
    expect(body.data.rxcui).toBe('5640')
    expect(body.data.name.toLowerCase()).toContain('ibuprofen')
  })

  it('resolves a drug name (case-insensitive)', async () => {
    const res = await app.request('/v1/drugs/resolve?q=Ibuprofen')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rxcui: string } }
    expect(body.data.rxcui).toBe('5640')
  })

  it('returns 404 for an unknown drug', async () => {
    const res = await app.request('/v1/drugs/resolve?q=unknowndrug12345')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('DRUG_NOT_FOUND')
  })

  it('returns 400 when q param is missing', async () => {
    const res = await app.request('/v1/drugs/resolve')
    expect(res.status).toBe(400)
  })

  it('resolves a brand name to its ingredient concept (case-insensitive)', async () => {
    // Requires `pnpm db:seed:classes` + `pnpm db:enrich` so that identifiers.brand_names
    // is populated on simvastatin (36567) with brands from RxNorm (includes Zocor).
    const res = await app.request('/v1/drugs/resolve?q=zocor')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rxcui: string; name: string } }
    expect(body.data.rxcui).toBe('36567')
    expect(body.data.name.toLowerCase()).toContain('simvastatin')
  })

  it('resolves an NDC to its ingredient concept', async () => {
    // Requires `pnpm db:seed:classes` + `pnpm db:enrich` so simvastatin has NDCs populated.
    // 00574171015 is a live (non-suppressed) simvastatin NDC in the current RxNorm release.
    const res = await app.request('/v1/drugs/resolve?q=00574171015')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rxcui: string } }
    expect(body.data.rxcui).toBe('36567')
  })

  it('returns 404 for an unknown NDC', async () => {
    const res = await app.request('/v1/drugs/resolve?q=99999999999')
    expect(res.status).toBe(404)
  })
})

describe('GET /v1/drugs/:rxcui', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(() => {
    app = createApp(createDb(process.env['DATABASE_URL']!))
  })

  it('returns a drug concept by RxCUI', async () => {
    const res = await app.request('/v1/drugs/5640')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rxcui: string } }
    expect(body.data.rxcui).toBe('5640')
  })

  it('returns 404 for unknown RxCUI', async () => {
    const res = await app.request('/v1/drugs/XXXXXXX')
    expect(res.status).toBe(404)
  })
})
