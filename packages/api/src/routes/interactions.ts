import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { interactionQuerySchema, type Db } from '@melo-rx/core'
import { checkInteraction } from '../services/interaction.service.js'
import { withDisclaimer, DISCLAIMER } from '../middleware/disclaimer.js'

export function createInteractionsRouter(db: Db) {
  const router = new Hono()

  router.get(
    '/',
    zValidator('query', interactionQuerySchema),
    async (c) => {
      const start = Date.now()
      const { drug1, drug2 } = c.req.valid('query')

      const result = await checkInteraction(db, drug1, drug2)

      if ('notFound' in result) {
        return c.json(
          {
            error: 'DRUG_NOT_FOUND',
            message: `Drug could not be resolved: ${result.notFound}`,
            disclaimer: DISCLAIMER,
          },
          404,
        )
      }

      return c.json(
        withDisclaimer(result, { query_time_ms: Date.now() - start }),
      )
    },
  )

  return router
}
