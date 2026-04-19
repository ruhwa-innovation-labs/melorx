import type { IngredientIdentifiers } from './rxnorm-identifiers.js'

export interface DrugConceptIdentifiers {
  ndc: string[]
  atc: string | null
  drugbank: string | null
  brand_names: string[]
}

export const EMPTY_IDENTIFIERS: DrugConceptIdentifiers = {
  ndc: [],
  atc: null,
  drugbank: null,
  brand_names: [],
}

/**
 * Merge RxNorm-derived identifiers into an existing drug_concept.identifiers
 * value. Non-null existing fields are preserved; arrays union+sort.
 *
 * Returns the merged identifiers, or null when there is nothing to merge
 * (the existing row already matches the incoming fields).
 */
export function mergeIdentifiers(
  existing: DrugConceptIdentifiers | undefined,
  incoming: IngredientIdentifiers | undefined,
): DrugConceptIdentifiers | null {
  if (!incoming) return null
  const base: DrugConceptIdentifiers = existing ?? EMPTY_IDENTIFIERS
  const brands = [...new Set<string>([...base.brand_names, ...incoming.brand_names])].sort()
  const ndcs = [...new Set<string>([...base.ndc, ...incoming.ndc])].sort()
  return {
    ndc: ndcs,
    atc: base.atc ?? incoming.atc,
    drugbank: base.drugbank,
    brand_names: brands,
  }
}

export function identifiersEqual(
  a: DrugConceptIdentifiers | undefined,
  b: DrugConceptIdentifiers,
): boolean {
  if (!a) return false
  if (a.atc !== b.atc) return false
  if (a.drugbank !== b.drugbank) return false
  if (!arraysEqual(a.ndc, b.ndc)) return false
  if (!arraysEqual(a.brand_names, b.brand_names)) return false
  return true
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
