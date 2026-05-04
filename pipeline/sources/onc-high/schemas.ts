import { z } from 'zod'
import { SOURCE_TYPES } from '@melo-rx/core'

export const oncHighEntrySchema = z.object({
  drug1: z.object({ rxcui: z.string().min(1), name: z.string().min(1) }),
  drug2: z.object({ rxcui: z.string().min(1), name: z.string().min(1) }),
  severity: z.enum(['contraindicated', 'serious', 'significant', 'monitor']),
  mechanism: z.string().min(1),
  management: z.string().min(1),
  source: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    type: z.enum(SOURCE_TYPES),
    accessed_date: z.string().date(),
  }),
})

export const seedFileSchema = z.array(oncHighEntrySchema)
