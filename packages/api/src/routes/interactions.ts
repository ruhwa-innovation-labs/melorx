import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  interactionQuerySchema,
  interactionBatchRequestSchema,
  type Db,
  type InteractionResult,
} from '@melo-rx/core'
import { checkInteraction } from '../services/interaction.service.js'
import { withDisclaimer, DISCLAIMER } from '../middleware/disclaimer.js'

interface BatchError {
  index: number
  error: 'DRUG_NOT_FOUND'
  drug: string
}

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

  router.post(
    '/batch',
    zValidator('json', interactionBatchRequestSchema),
    async (c) => {
      const start = Date.now()
      const { pairs } = c.req.valid('json')

      const results = await Promise.all(
        pairs.map((p) => checkInteraction(db, p.drug1, p.drug2)),
      )

      const data: InteractionResult[] = []
      const errors: BatchError[] = []
      results.forEach((r, index) => {
        if ('notFound' in r) {
          errors.push({ index, error: 'DRUG_NOT_FOUND', drug: r.notFound })
        } else {
          data.push(r)
        }
      })

      return c.json({
        data,
        errors,
        disclaimer: DISCLAIMER,
        meta: {
          version: '0.1.0',
          dataset_version: new Date().toISOString().slice(0, 10),
          query_time_ms: Date.now() - start,
          pairs_requested: pairs.length,
          pairs_resolved: data.length,
          pairs_failed: errors.length,
        },
      })
    },
  )

  return router
}
