import { serve } from '@hono/node-server'
import { createDb, logger } from '@melorx/core'
import { createApp } from './app.js'

const url = process.env['DATABASE_URL']
if (!url) throw new Error('DATABASE_URL is required')

const db = createDb(url)
const app = createApp(db)
const port = Number(process.env['API_PORT'] ?? 3000)

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'melorx API started')
})
