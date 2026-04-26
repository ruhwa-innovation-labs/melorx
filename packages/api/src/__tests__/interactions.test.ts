import { describe, it, expect, beforeAll } from 'vitest'
import { createDb } from '@melorx/core'
import { createApp } from '../app.js'

describe('GET /v1/interactions', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(() => {
    app = createApp(createDb(process.env['DATABASE_URL']!))
  })

  it('returns a known interaction with correct severity', async () => {
    // ibuprofen (5640) + lisinopril (29046) → moderate (seeded from ONCHigh "significant")
    const res = await app.request('/v1/interactions?drug1=5640&drug2=29046')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      data: {
        drug1: { rxcui: string }
        drug2: { rxcui: string }
        interactions: Array<{ severity: string }>
      }
      disclaimer: string
      meta: { version: string }
    }
    expect(body.data.interactions).toHaveLength(1)
    expect(body.data.interactions[0]?.severity).toBe('moderate')
  })

  it('returns the same result regardless of drug order', async () => {
    const res1 = await app.request('/v1/interactions?drug1=5640&drug2=29046')
    const res2 = await app.request('/v1/interactions?drug1=29046&drug2=5640')
    const b1 = await res1.json() as { data: { interactions: unknown[] } }
    const b2 = await res2.json() as { data: { interactions: unknown[] } }
    expect(b1.data.interactions).toHaveLength(b2.data.interactions.length)
  })

  it('always includes a non-empty disclaimer field', async () => {
    const res = await app.request('/v1/interactions?drug1=5640&drug2=29046')
    const body = await res.json() as { disclaimer: string }
    expect(typeof body.disclaimer).toBe('string')
    expect(body.disclaimer.length).toBeGreaterThan(20)
  })

  it('returns empty interactions array for a pair with no known DDI', async () => {
    // warfarin (11289) + lisinopril (29046) — not in seed data
    const res = await app.request('/v1/interactions?drug1=11289&drug2=29046')
    const body = await res.json() as { data?: { interactions: unknown[] }; error?: string }
    if (body.error) {
      expect(res.status).toBe(404)
    } else {
      expect(body.data?.interactions).toHaveLength(0)
    }
  })

  it('returns 400 when drug2 param is missing', async () => {
    const res = await app.request('/v1/interactions?drug1=5640')
    expect(res.status).toBe(400)
  })

  it('accepts drug names as well as RxCUIs', async () => {
    const res = await app.request('/v1/interactions?drug1=ibuprofen&drug2=lisinopril')
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { interactions: unknown[] } }
    expect(body.data.interactions).toHaveLength(1)
  })

  it('returns 404 when a drug cannot be resolved', async () => {
    const res = await app.request('/v1/interactions?drug1=notadrug99999&drug2=5640')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string; disclaimer: string }
    expect(body.error).toBe('DRUG_NOT_FOUND')
    expect(body.disclaimer).toBe(
      'melorx is for informational purposes only. It does not constitute medical advice and must not replace clinical judgment. Always consult a licensed healthcare professional.',
    )
  })

  it('includes source citations on each interaction', async () => {
    const res = await app.request('/v1/interactions?drug1=5640&drug2=29046')
    const body = await res.json() as {
      data: { interactions: Array<{ sources: unknown[] }> }
    }
    expect(body.data.interactions[0]?.sources).toHaveLength(1)
  })

  it('expands class rules at query time — simvastatin + clarithromycin is contraindicated', async () => {
    // Requires `pnpm db:seed:classes` — simvastatin picks up class "Simvastatin and lovastatin"
    // and clarithromycin picks up "CYP3A4 inhibitors (macrolides and related)"; rule 25 covers the pair.
    const res = await app.request('/v1/interactions?drug1=simvastatin&drug2=clarithromycin')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      data: {
        drug1: { classes: string[] }
        drug2: { classes: string[] }
        interactions: Array<{ severity: string; sources: Array<{ name: string }> }>
      }
    }
    expect(body.data.drug1.classes).toContain('Simvastatin and lovastatin')
    expect(body.data.drug2.classes).toContain('CYP3A4 inhibitors (macrolides and related)')
    expect(body.data.interactions.length).toBeGreaterThan(0)
    const severities = body.data.interactions.map((i) => i.severity)
    expect(severities).toContain('contraindicated')
    expect(body.data.interactions[0]?.sources[0]?.name).toBe('ONCHigh')
  })
})
