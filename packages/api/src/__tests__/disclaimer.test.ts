import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { disclaimerMiddleware, DISCLAIMER, withDisclaimer } from '../middleware/disclaimer.js'

describe('disclaimerMiddleware', () => {
  it('injects disclaimer into JSON responses that lack one', async () => {
    const app = new Hono()
    app.use('/*', disclaimerMiddleware)
    app.get('/test', (c) => c.json({ data: 'hello' }))

    const res = await app.request('/test')
    const body = await res.json() as { data: string; disclaimer: string }
    expect(body.disclaimer).toBe(DISCLAIMER)
  })

  it('does not duplicate disclaimer if already present', async () => {
    const app = new Hono()
    app.use('/*', disclaimerMiddleware)
    app.get('/test', (c) => c.json({ data: 'hello', disclaimer: DISCLAIMER }))

    const res = await app.request('/test')
    const body = await res.json() as Record<string, unknown>
    const keys = Object.keys(body).filter((k) => k === 'disclaimer')
    expect(keys).toHaveLength(1)
  })

  it('does not modify non-JSON responses', async () => {
    const app = new Hono()
    app.use('/*', disclaimerMiddleware)
    app.get('/test', (c) => c.text('plain text'))

    const res = await app.request('/test')
    const text = await res.text()
    expect(text).toBe('plain text')
  })
})

describe('withDisclaimer', () => {
  it('wraps data with disclaimer and meta fields', () => {
    const result = withDisclaimer({ foo: 'bar' })
    expect(result.data).toEqual({ foo: 'bar' })
    expect(result.disclaimer).toBe(DISCLAIMER)
    expect(result.meta.version).toBe('0.1.0')
  })

  it('merges extra meta fields', () => {
    const result = withDisclaimer({ x: 1 }, { query_time_ms: 4 })
    expect(result.meta.query_time_ms).toBe(4)
  })
})
