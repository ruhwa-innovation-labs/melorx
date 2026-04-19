import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

export interface IngredientRecord {
  rxcui: string
  name: string
  tty: IngredientTty
}

export type IngredientTty = 'IN' | 'PIN' | 'MIN'

const TTY_PRIORITY: Record<IngredientTty, number> = { IN: 0, PIN: 1, MIN: 2 }

const DEFAULT_RRF_PATH = resolve(
  new URL('.', import.meta.url).pathname,
  'raw/RXNCONSO.RRF',
)

export async function loadIngredientIndex(
  rrfPath: string = DEFAULT_RRF_PATH,
): Promise<Map<string, IngredientRecord>> {
  const index = new Map<string, IngredientRecord>()
  const stream = createReadStream(rrfPath, { encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    const cols = line.split('|')
    if (cols[11] !== 'RXNORM') continue
    const tty = cols[12]
    if (tty !== 'IN' && tty !== 'PIN' && tty !== 'MIN') continue
    const rxcui = cols[0]
    const name = cols[14]
    if (!rxcui || !name) continue

    const key = name.toLowerCase()
    const existing = index.get(key)
    if (!existing || TTY_PRIORITY[tty] < TTY_PRIORITY[existing.tty]) {
      index.set(key, { rxcui, name, tty })
    }
  }

  return index
}

export function resolveIngredient(
  index: Map<string, IngredientRecord>,
  rawName: string,
): IngredientRecord | null {
  return index.get(rawName.trim().toLowerCase()) ?? null
}
