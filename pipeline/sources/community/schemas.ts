import { z } from 'zod'
import { SEVERITY_VALUES, SOURCE_TYPES } from '@melorx/core'

const rxcuiSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^\d+$/, 'rxcui must be numeric')

const drugRefSchema = z.object({
  rxcui: rxcuiSchema,
  name: z.string().min(1).max(200),
})

const sourceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  type: z.enum(SOURCE_TYPES),
  accessed_date: z.string().date(),
  citation: z.string().min(1).max(1000).optional(),
})

const submitterSchema = z.object({
  name: z.string().min(1).max(200),
  github: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'github handle must match ^[A-Za-z0-9-]+$')
    .optional(),
  affiliation: z.string().min(1).max(200).optional(),
})

export const communityEntrySchema = z
  .object({
    drug1: drugRefSchema,
    drug2: drugRefSchema,
    severity: z.enum(SEVERITY_VALUES),
    mechanism: z.string().min(1).max(2000).nullable(),
    management: z.string().min(1).max(2000).nullable(),
    sources: z.array(sourceSchema).min(1, 'at least one source is required'),
    submitted_by: submitterSchema,
    notes: z.string().max(2000).optional(),
  })
  .refine((e) => e.drug1.rxcui !== e.drug2.rxcui, {
    message: 'drug1.rxcui and drug2.rxcui must differ',
    path: ['drug2', 'rxcui'],
  })

export type CommunityEntry = z.infer<typeof communityEntrySchema>
