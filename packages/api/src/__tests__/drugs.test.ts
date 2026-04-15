import { describe, it, expect, beforeAll } from 'vitest'
import { createDb } from '@melo-rx/core'
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
