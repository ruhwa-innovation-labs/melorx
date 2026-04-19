import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

export interface IngredientIdentifiers {
  atc: string | null
  brand_names: string[]
}

interface ConsoPassResult {
  atcByRxcui: Map<string, string>
  brandStringByRxcui: Map<string, string>
}

const DEFAULT_CONSO_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  'raw/RXNCONSO.RRF',
)
const DEFAULT_REL_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  'raw/RXNREL.RRF',
)

export async function loadIdentifierIndex(
  opts: { consoPath?: string; relPath?: string } = {},
): Promise<Map<string, IngredientIdentifiers>> {
  const consoPath = opts.consoPath ?? DEFAULT_CONSO_PATH
  const relPath = opts.relPath ?? DEFAULT_REL_PATH

  const conso = await scanRxnconso(consoPath)
  const brandsByIngredient = await scanTradenameGraph(relPath)

  const out = new Map<string, IngredientIdentifiers>()
  const ingredientRxcuis = new Set<string>([
    ...conso.atcByRxcui.keys(),
    ...brandsByIngredient.keys(),
  ])

  for (const rxcui of ingredientRxcuis) {
    const atc = conso.atcByRxcui.get(rxcui) ?? null
    const brandRxcuis = brandsByIngredient.get(rxcui) ?? []
    const brands = new Set<string>()
    for (const bn of brandRxcuis) {
      const name = conso.brandStringByRxcui.get(bn)
      if (name) brands.add(name)
    }
    out.set(rxcui, {
      atc,
      brand_names: [...brands].sort(),
    })
  }
  return out
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

async function scanTradenameGraph(path: string): Promise<Map<string, string[]>> {
  const brandsByIngredient = new Map<string, string[]>()
  const stream = createReadStream(path, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split('|')
    if (cols[10] !== 'RXNORM') continue
    if (cols[7] !== 'tradename_of') continue
    const ingredientRxcui = cols[0]
    const brandRxcui = cols[4]
    if (!ingredientRxcui || !brandRxcui) continue

    const arr = brandsByIngredient.get(ingredientRxcui)
    if (arr) arr.push(brandRxcui)
    else brandsByIngredient.set(ingredientRxcui, [brandRxcui])
  }

  return brandsByIngredient
}
