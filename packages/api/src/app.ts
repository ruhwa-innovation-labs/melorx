import { Hono } from 'hono'
import { createHealthRouter } from './routes/health.js'
import { disclaimerMiddleware } from './middleware/disclaimer.js'
import type { Db } from '@melo-rx/core'

export function createApp(db: Db) {
  const app = new Hono()

  app.route('/health', createHealthRouter(db))

  // Non-suppressible disclaimer on all /v1/interactions routes
  app.use('/v1/interactions', disclaimerMiddleware)
  app.use('/v1/interactions/*', disclaimerMiddleware)

  return app
}
