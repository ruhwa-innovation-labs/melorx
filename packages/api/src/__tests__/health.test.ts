import { describe, it, expect, beforeAll } from 'vitest'
import { createDb } from '@melorx/core'
import { createApp } from '../app.js'

describe('GET /health', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(() => {
    const db = createDb(process.env['DATABASE_URL']!)
    app = createApp(db)
  })

  it('returns 200 with status ok when database is reachable', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string; db: string; version: string }
    expect(body.status).toBe('ok')
    expect(body.db).toBe('connected')
    expect(body.version).toBe('0.1.0')
  })

  it('returns JSON content-type', async () => {
    const res = await app.request('/health')
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})
