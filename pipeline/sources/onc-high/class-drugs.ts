import type { ClassRulesFile } from './class-types.js'

export interface DrugMembership {
  name: string
  classes: string[]
}

export function collectDrugMemberships(
  file: ClassRulesFile,
): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>()

  const add = (drug: string, className: string): void => {
    const key = drug.trim()
    if (!key) return
    const set = membership.get(key) ?? new Set<string>()
    set.add(className)
    membership.set(key, set)
  }

  for (const rule of file.rules) {
    for (const drug of rule.object_drugs) add(drug, rule.object_class)
    for (const group of rule.precipitant_groups) {
      for (const drug of group.drugs) add(drug, group.class)
    }
  }

  return membership
}
