export const SEVERITY_VALUES = [
  'contraindicated',
  'serious',
  'moderate',
  'minor',
  'monitor',
] as const

export type Severity = (typeof SEVERITY_VALUES)[number]
