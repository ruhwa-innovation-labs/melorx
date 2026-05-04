import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import type { Db } from '@melo-rx/core'

export function createHealthRouter(db: Db) {
  const router = new Hono()

  router.get('/', async (c) => {
    try {
      await db.execute(sql`SELECT 1`)
      return c.json({ status: 'ok', db: 'connected', version: '0.1.0' })
    } catch {
      return c.json(
        { status: 'error', db: 'disconnected', version: '0.1.0' },
        503,
      )
    }
  })

  return router
}
