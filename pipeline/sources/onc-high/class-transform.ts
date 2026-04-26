import type { InteractionSource } from '@melorx/core'
import type {
  ClassInteractionRow,
  ClassRuleEntry,
  ClassRulesFile,
} from './class-types.js'

export function toClassInteractionRows(
  file: ClassRulesFile,
): ClassInteractionRow[] {
  const source: InteractionSource = {
    name: file.source.name,
    url: file.source.url,
    type: file.source.type,
    accessed_date: file.source.accessed_date,
  }
  return file.rules.flatMap((rule) => expandRule(rule, source))
}

function expandRule(
  rule: ClassRuleEntry,
  source: InteractionSource,
): ClassInteractionRow[] {
  return rule.precipitant_groups.map((group) => ({
    class_a: rule.object_class,
    class_b: group.class,
    severity: rule.severity,
    mechanism: rule.mechanism,
    management: rule.management,
    sources: [source],
  }))
}
