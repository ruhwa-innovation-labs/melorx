import type { InteractionSource, Severity } from '@melo-rx/core'

export interface ClassRulePrecipitantGroup {
  class: string
  drugs: string[]
}

export interface ClassRuleEntry {
  rule_number: number
  object_class: string
  object_drugs: string[]
  precipitant_groups: ClassRulePrecipitantGroup[]
  severity: Severity
  mechanism: string
  management: string
}

export interface ClassRulesFile {
  source: InteractionSource & { citation: string }
  deferred_rules: Array<{
    rule_number: number
    object_class: string
    precipitant_class: string
    reason: string
  }>
  rules: ClassRuleEntry[]
}

export interface ClassInteractionRow {
  class_a: string
  class_b: string
  severity: Severity
  mechanism: string
  management: string
  sources: InteractionSource[]
}
