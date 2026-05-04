import { describe, it, expect, beforeAll } from 'vitest'
import { createDb } from '@melo-rx/core'
import { createApp } from '../app.js'

describe('POST /v1/interactions/batch', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(() => {
    app = createApp(createDb(process.env['DATABASE_URL']!))
  })

  async function post(body: unknown): Promise<Response> {
    return app.request('/v1/interactions/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns resolved pairs in data[] and unresolved ones in errors[]', async () => {
    const res = await post({
      pairs: [
        { drug1: 'ibuprofen', drug2: 'lisinopril' },
        { drug1: 'warfarin', drug2: 'aspirin' },
        { drug1: 'notadrug99999', drug2: '5640' },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      data: Array<{ interactions: Array<{ severity: string }> }>
      errors: Array<{ index: number; error: string; drug: string }>
      disclaimer: string
      meta: {
        pairs_requested: number
        pairs_resolved: number
        pairs_failed: number
      }
    }

    expect(body.data).toHaveLength(2)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]?.index).toBe(2)
    expect(body.errors[0]?.error).toBe('DRUG_NOT_FOUND')
    expect(body.errors[0]?.drug).toBe('notadrug99999')
    expect(body.meta.pairs_requested).toBe(3)
    expect(body.meta.pairs_resolved).toBe(2)
    expect(body.meta.pairs_failed).toBe(1)
  })

  it('preserves severities from the single-pair endpoint', async () => {
    const res = await post({
      pairs: [
        { drug1: '11289', drug2: '1191' }, // warfarin + aspirin → serious
        { drug1: '5640', drug2: '29046' }, // ibuprofen + lisinopril → moderate
      ],
    })
    const body = await res.json() as {
      data: Array<{ interactions: Array<{ severity: string }> }>
    }
    expect(body.data[0]?.interactions[0]?.severity).toBe('serious')
    expect(body.data[1]?.interactions[0]?.severity).toBe('moderate')
  })

  it('always includes a non-empty disclaimer field', async () => {
    const res = await post({
      pairs: [{ drug1: 'ibuprofen', drug2: 'lisinopril' }],
    })
    const body = await res.json() as { disclaimer: string }
    expect(typeof body.disclaimer).toBe('string')
    expect(body.disclaimer.length).toBeGreaterThan(20)
  })

  it('returns 400 when pairs is empty', async () => {
    const res = await post({ pairs: [] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when pairs exceeds 50', async () => {
    const pairs = Array.from({ length: 51 }, () => ({
      drug1: 'ibuprofen',
      drug2: 'lisinopril',
    }))
    const res = await post({ pairs })
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is missing pairs field', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
  })

  it('accepts the maximum 50 pairs', async () => {
    const pairs = Array.from({ length: 50 }, () => ({
      drug1: 'ibuprofen',
      drug2: 'lisinopril',
    }))
    const res = await post({ pairs })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(body.data).toHaveLength(50)
  })
})
