export interface DrugIdentifiers {
  ndc: string[]
  atc: string | null
  drugbank: string | null
  brand_names: string[]
}

export interface DrugConcept {
  id: string
  rxcui: string
  name: string
  drug_class: string[]
  identifiers: DrugIdentifiers
}
