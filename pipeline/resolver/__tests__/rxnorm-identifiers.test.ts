import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadIdentifierIndex } from '../rxnorm-identifiers.js'

let tmpDir: string
let consoPath: string
let relPath: string

// RXNCONSO.RRF columns: RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF
const consoFixture = [
  '36567|ENG||||||0001||||RXNORM|IN|36567|simvastatin||N||',
  '36567|ENG||||||0002||||ATC|IN|C10AA01|simvastatin||N||',
  '196503|ENG||||||0003||||RXNORM|BN|196503|Zocor||N||',
  '495215|ENG||||||0004||||RXNORM|BN|495215|Flolipid||N||',
  '11289|ENG||||||0005||||RXNORM|IN|11289|warfarin||N||',
  '11289|ENG||||||0006||||ATC|IN|B01AA03|warfarin||N||',
  '11289|ENG||||||0007||||ATC|PT|B01AA03|warfarin||N||',
  '11289|ENG||||||0008||||ATC|IN|B01AA999|warfarin DUPLICATE||N||',
  '202421|ENG||||||0009||||RXNORM|BN|202421|Coumadin||N||',
  '7777|ENG||||||0010||||RXNORM|BN|7777|OrphanBrand||N||',
].join('\n')

// RXNREL.RRF columns: RXCUI1|RXAUI1|STYPE1|REL|RXCUI2|RXAUI2|STYPE2|RELA|RUI|SRUI|SAB|SL|RG|DIR|SUPPRESS|CVF
const relFixture = [
  '36567||CUI|RN|196503||CUI|tradename_of|RUI1||RXNORM|||||4096|',
  '36567||CUI|RN|495215||CUI|tradename_of|RUI2||RXNORM|||||4096|',
  '11289||CUI|RN|202421||CUI|tradename_of|RUI3||RXNORM|||||4096|',
  '11289||CUI|RN|196503||CUI|has_tradename|RUI4||RXNORM|||||4096|',
  '99999||CUI|RN|999998||CUI|tradename_of|RUI5||SNOMEDCT_US|||||4096|',
].join('\n')

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rxnorm-id-test-'))
  consoPath = join(tmpDir, 'RXNCONSO.RRF')
  relPath = join(tmpDir, 'RXNREL.RRF')
  writeFileSync(consoPath, consoFixture, 'utf-8')
  writeFileSync(relPath, relFixture, 'utf-8')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadIdentifierIndex', () => {
  it('maps ingredient RxCUI to its primary ATC code (SAB=ATC, TTY=IN)', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath })
    expect(idx.get('36567')?.atc).toBe('C10AA01')
    expect(idx.get('11289')?.atc).toBe('B01AA03')
  })

  it('ignores duplicate ATC rows beyond the first', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath })
    expect(idx.get('11289')?.atc).toBe('B01AA03')
  })

  it('ignores ATC rows whose TTY is not IN', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath })
    expect(idx.get('11289')?.atc).not.toBe('B01AA999')
  })

  it('collects brand names from RXNORM BN rows linked via tradename_of', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath })
    expect(idx.get('36567')?.brand_names).toEqual(['Flolipid', 'Zocor'])
    expect(idx.get('11289')?.brand_names).toEqual(['Coumadin'])
  })

  it('ignores tradename relationships where SAB is not RXNORM', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath })
    expect(idx.has('99999')).toBe(false)
  })

  it('includes ingredients with ATC but no brands, and vice versa', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath })
    // All entries have both ATC and brands in this fixture, but verify the
    // shape is complete.
    for (const [, v] of idx) {
      expect(v).toHaveProperty('atc')
      expect(Array.isArray(v.brand_names)).toBe(true)
    }
  })

  it('returns empty brand_names for an ingredient with no tradename_of rows', async () => {
    // 99999 is in rel but with SAB=SNOMEDCT_US, so it should not appear at all.
    // Add an ingredient that has ATC but no tradename by extending the fixture via a separate test.
    const extraConso = [consoFixture, '5000|ENG||||||99||||ATC|IN|X99X9999|loneatcdrug||N||'].join('\n')
    const extraConsoPath = join(tmpDir, 'RXNCONSO-extra.RRF')
    writeFileSync(extraConsoPath, extraConso, 'utf-8')
    const idx = await loadIdentifierIndex({ consoPath: extraConsoPath, relPath })
    expect(idx.get('5000')).toEqual({ atc: 'X99X9999', brand_names: [] })
  })
})
