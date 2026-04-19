import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadIngredientIndex, resolveIngredient } from '../rxnorm-ingredients.js'

let tmpDir: string
let rrfPath: string

const fixture = [
  // columns: RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF
  '11289|ENG||||||0001||||RXNORM|IN|11289|warfarin||N||',
  '36567|ENG||||||0002||||RXNORM|IN|36567|simvastatin||N||',
  '42355|ENG||||||0003||||RXNORM|IN|42355|Fluvoxamine||N||',
  '42355|ENG||||||0004||||RXNORM|SY|42355|fluvoxamine maleate||N||',
  '99999|ENG||||||0005||||SNOMEDCT_US|IN|99999|simvastatin||N||',
  '7777|ENG||||||0006||||RXNORM|PIN|7777|Warfarin Sodium||N||',
  '8888|ENG||||||0007||||RXNORM|MIN|8888|simvastatin / ezetimibe||N||',
].join('\n')

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rxnorm-test-'))
  rrfPath = join(tmpDir, 'RXNCONSO.RRF')
  writeFileSync(rrfPath, fixture, 'utf-8')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadIngredientIndex', () => {
  it('indexes ingredient rows by lowercase name', async () => {
    const idx = await loadIngredientIndex(rrfPath)
    expect(resolveIngredient(idx, 'Warfarin')?.rxcui).toBe('11289')
    expect(resolveIngredient(idx, 'SIMVASTATIN')?.rxcui).toBe('36567')
    expect(resolveIngredient(idx, 'fluvoxamine')?.rxcui).toBe('42355')
  })

  it('ignores rows whose SAB is not RXNORM', async () => {
    const idx = await loadIngredientIndex(rrfPath)
    expect(resolveIngredient(idx, 'simvastatin')?.rxcui).toBe('36567')
  })

  it('ignores TTY values outside IN/PIN/MIN (e.g. SY synonyms)', async () => {
    const idx = await loadIngredientIndex(rrfPath)
    expect(resolveIngredient(idx, 'fluvoxamine maleate')).toBeNull()
  })

  it('prefers IN over PIN when two rows share a lowercase name', async () => {
    const idx = await loadIngredientIndex(rrfPath)
    expect(resolveIngredient(idx, 'warfarin')?.tty).toBe('IN')
  })

  it('returns null for unknown names', async () => {
    const idx = await loadIngredientIndex(rrfPath)
    expect(resolveIngredient(idx, 'not-a-drug')).toBeNull()
  })
})
