import { Hono } from 'hono'
import { createHealthRouter } from './routes/health.js'
import type { Db } from '@melo-rx/core'

export function createApp(db: Db) {
  const app = new Hono()

  app.route('/health', createHealthRouter(db))

  return app
}
