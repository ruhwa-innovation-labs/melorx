import { z } from 'zod'
import { SEVERITY_VALUES, SOURCE_TYPES } from '@melorx/core'

const precipitantGroupSchema = z.object({
  class: z.string().min(1),
  drugs: z.array(z.string().min(1)).min(1),
})

export const classRuleEntrySchema = z.object({
  rule_number: z.number().int().positive(),
  object_class: z.string().min(1),
  object_drugs: z.array(z.string().min(1)).min(1),
  precipitant_groups: z.array(precipitantGroupSchema).min(1),
  severity: z.enum(SEVERITY_VALUES),
  mechanism: z.string().min(1),
  management: z.string().min(1),
})

export const classRulesFileSchema = z.object({
  source: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    type: z.enum(SOURCE_TYPES),
    accessed_date: z.string().date(),
    citation: z.string().min(1),
  }),
  deferred_rules: z.array(
    z.object({
      rule_number: z.number().int().positive(),
      object_class: z.string().min(1),
      precipitant_class: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
  rules: z.array(classRuleEntrySchema).min(1),
})
