import { z } from 'zod'
import { SEVERITY_VALUES } from '../types/severity.js'

export const severitySchema = z.enum(SEVERITY_VALUES)

export const resolveQuerySchema = z.object({
  q: z.string().min(1).max(200),
})

export const interactionQuerySchema = z.object({
  drug1: z.string().min(1).max(200),
  drug2: z.string().min(1).max(200),
})

export const interactionSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum([
    'clinical_guideline',
    'fda_label',
    'peer_reviewed_study',
    'clinical_pharmacist_review',
  ]),
  accessed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
