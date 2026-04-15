import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { resolveQuerySchema, type Db } from '@melo-rx/core'
import { resolveDrug, getDrugByCui } from '../services/drug.service.js'

export function createDrugsRouter(db: Db) {
  const router = new Hono()

  router.get(
    '/resolve',
    zValidator('query', resolveQuerySchema),
    async (c) => {
      const { q } = c.req.valid('query')
      const drug = await resolveDrug(db, q)

      if (!drug) {
        return c.json(
          { error: 'DRUG_NOT_FOUND', message: `No drug found for query: ${q}` },
          404,
        )
      }

      return c.json({ data: drug, meta: { version: '0.1.0' } })
    },
  )

  router.get('/:rxcui', async (c) => {
    const rxcui = c.req.param('rxcui')
    const drug = await getDrugByCui(db, rxcui)

    if (!drug) {
      return c.json(
        { error: 'DRUG_NOT_FOUND', message: `No drug found for RxCUI: ${rxcui}` },
        404,
      )
    }

    return c.json({ data: drug, meta: { version: '0.1.0' } })
  })

  return router
}
