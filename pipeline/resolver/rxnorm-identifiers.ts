import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

export interface IngredientIdentifiers {
  atc: string | null
  brand_names: string[]
  ndc: string[]
}

interface ConsoPassResult {
  atcByRxcui: Map<string, string>
  brandStringByRxcui: Map<string, string>
}

interface RelGraphs {
  /** ingredient RxCUI → SCDC/SBDC container RxCUIs (follows `has_ingredient` rows). */
  containersByIngredient: Map<string, string[]>
  /** SCDC/SBDC RxCUI → SCD/SBD drug RxCUIs (follows `consists_of` rows). */
  drugsByContainer: Map<string, string[]>
  /** SCD RxCUI → SBD RxCUIs (follows `has_tradename` rows). */
  brandsByClinical: Map<string, string[]>
  /** ingredient RxCUI → BN RxCUIs (follows `tradename_of` rows on IN). */
  bnsByIngredient: Map<string, string[]>
}

const DEFAULT_CONSO_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  'raw/RXNCONSO.RRF',
)
const DEFAULT_REL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  'raw/RXNREL.RRF',
)
const DEFAULT_SAT_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  'raw/RXNSAT.RRF',
)

export async function loadIdentifierIndex(
  opts: { consoPath?: string; relPath?: string; satPath?: string } = {},
): Promise<Map<string, IngredientIdentifiers>> {
  const consoPath = opts.consoPath ?? DEFAULT_CONSO_PATH
  const relPath = opts.relPath ?? DEFAULT_REL_PATH
  const satPath = opts.satPath ?? DEFAULT_SAT_PATH

  const conso = await scanRxnconso(consoPath)
  const graphs = await scanRxnrelGraphs(relPath)
  const ndcByParent = await scanNdcAttributes(satPath)

  const out = new Map<string, IngredientIdentifiers>()
  const ingredientRxcuis = new Set<string>([
    ...conso.atcByRxcui.keys(),
    ...graphs.bnsByIngredient.keys(),
    ...graphs.containersByIngredient.keys(),
  ])

  for (const rxcui of ingredientRxcuis) {
    const atc = conso.atcByRxcui.get(rxcui) ?? null

    const brands = new Set<string>()
    for (const bn of graphs.bnsByIngredient.get(rxcui) ?? []) {
      const name = conso.brandStringByRxcui.get(bn)
      if (name) brands.add(name)
    }

    const ndcs = new Set<string>()
    for (const descendant of collectDescendantDrugs(rxcui, graphs)) {
      const list = ndcByParent.get(descendant)
      if (list) for (const n of list) ndcs.add(n)
    }

    out.set(rxcui, {
      atc,
      brand_names: [...brands].sort(),
      ndc: [...ndcs].sort(),
    })
  }
  return out
}

function collectDescendantDrugs(
  ingredient: string,
  graphs: RelGraphs,
): Set<string> {
  const drugs = new Set<string>()
  for (const container of graphs.containersByIngredient.get(ingredient) ?? []) {
    for (const clinical of graphs.drugsByContainer.get(container) ?? []) {
      drugs.add(clinical)
      for (const branded of graphs.brandsByClinical.get(clinical) ?? []) {
        drugs.add(branded)
      }
    }
  }
  return drugs
}

async function scanRxnconso(path: string): Promise<ConsoPassResult> {
  const atcByRxcui = new Map<string, string>()
  const brandStringByRxcui = new Map<string, string>()

  const stream = createReadStream(path, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split('|')
    const rxcui = cols[0]
    const sab = cols[11]
    const tty = cols[12]
    const code = cols[13]
    const str = cols[14]
    if (!rxcui) continue

    if (sab === 'ATC' && tty === 'IN' && code && !atcByRxcui.has(rxcui)) {
      atcByRxcui.set(rxcui, code)
      continue
    }

    if (sab === 'RXNORM' && tty === 'BN' && str) {
      brandStringByRxcui.set(rxcui, str)
    }
  }

  return { atcByRxcui, brandStringByRxcui }
}

async function scanRxnrelGraphs(path: string): Promise<RelGraphs> {
  const containersByIngredient = new Map<string, string[]>()
  const drugsByContainer = new Map<string, string[]>()
  const brandsByClinical = new Map<string, string[]>()
  const bnsByIngredient = new Map<string, string[]>()

  const stream = createReadStream(path, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split('|')
    if (cols[10] !== 'RXNORM') continue
    const rela = cols[7]
    const rxcui1 = cols[0]
    const rxcui2 = cols[4]
    if (!rxcui1 || !rxcui2) continue

    // RELA reads "RXCUI2 <rela> RXCUI1".
    switch (rela) {
      case 'tradename_of':
        // RXCUI2 (BN) tradename_of RXCUI1 (IN).
        pushTo(bnsByIngredient, rxcui1, rxcui2)
        break
      case 'ingredient_of':
        // RXCUI2 (IN) ingredient_of RXCUI1 (container).
        pushTo(containersByIngredient, rxcui2, rxcui1)
        break
      case 'consists_of':
        // Row reads "RXCUI2 consists_of RXCUI1": RXCUI2 is the SCD/SBD drug,
        // RXCUI1 is the SCDC/SBDC container component. Index container → drugs.
        pushTo(drugsByContainer, rxcui1, rxcui2)
        break
      case 'has_tradename':
        // RXCUI2 (SCD clinical drug) has_tradename RXCUI1 (SBD branded drug).
        pushTo(brandsByClinical, rxcui2, rxcui1)
        break
      default:
        break
    }
  }

  return { containersByIngredient, drugsByContainer, brandsByClinical, bnsByIngredient }
}

async function scanNdcAttributes(path: string): Promise<Map<string, string[]>> {
  const ndcByParent = new Map<string, string[]>()
  const stream = createReadStream(path, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split('|')
    if (cols[9] !== 'RXNORM') continue
    if (cols[8] !== 'NDC') continue
    const rxcui = cols[0]
    const ndc = cols[10]
    if (!rxcui || !ndc) continue
    pushTo(ndcByParent, rxcui, ndc)
  }

  return ndcByParent
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}
