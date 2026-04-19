import { z } from 'zod'
import { SEVERITY_VALUES } from '../types/severity.js'
import { SOURCE_TYPES } from '../types/drug-interaction.js'

export const severitySchema = z.enum(SEVERITY_VALUES)

export const resolveQuerySchema = z.object({
  q: z.string().min(1).max(200),
})

export const interactionQuerySchema = z.object({
  drug1: z.string().min(1).max(200),
  drug2: z.string().min(1).max(200),
})

export const interactionBatchRequestSchema = z.object({
  pairs: z
    .array(
      z.object({
        drug1: z.string().min(1).max(200),
        drug2: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(50),
})

export const interactionSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(SOURCE_TYPES),
  accessed_date: z.string().date(),
})
