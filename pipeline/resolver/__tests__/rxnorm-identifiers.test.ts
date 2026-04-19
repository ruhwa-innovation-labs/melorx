import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadIdentifierIndex } from '../rxnorm-identifiers.js'

let tmpDir: string
let consoPath: string
let relPath: string
let satPath: string

// RXNCONSO.RRF: RXCUI|LAT|TS|LUI|STT|SUI|ISPREF|RXAUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF
const consoFixture = [
  // Ingredients
  '36567|ENG||||||0001||||RXNORM|IN|36567|simvastatin||N||',
  '11289|ENG||||||0002||||RXNORM|IN|11289|warfarin||N||',
  // ATC codes (primary + duplicate + non-IN TTY)
  '36567|ENG||||||0003||||ATC|IN|C10AA01|simvastatin||N||',
  '11289|ENG||||||0004||||ATC|IN|B01AA03|warfarin||N||',
  '11289|ENG||||||0005||||ATC|IN|B01AA999|warfarin DUPLICATE||N||',
  '11289|ENG||||||0006||||ATC|PT|B01AA03|warfarin||N||',
  // Brand name atoms
  '196503|ENG||||||0010||||RXNORM|BN|196503|Zocor||N||',
  '202421|ENG||||||0011||||RXNORM|BN|202421|Coumadin||N||',
  // SCDC containers
  '316672|ENG||||||0020||||RXNORM|SCDC|316672|simvastatin 10 MG||N||',
  '316986|ENG||||||0021||||RXNORM|SCDC|316986|warfarin 5 MG||N||',
  // SCD clinical drugs
  '314231|ENG||||||0030||||RXNORM|SCD|314231|simvastatin 10 MG Oral Tablet||N||',
  '855333|ENG||||||0031||||RXNORM|SCD|855333|warfarin 5 MG Oral Tablet||N||',
  // SBD branded drugs
  '104490|ENG||||||0040||||RXNORM|SBD|104490|simvastatin 10 MG Oral Tablet [Zocor]||N||',
  '855334|ENG||||||0041||||RXNORM|SBD|855334|warfarin 5 MG Oral Tablet [Coumadin]||N||',
].join('\n')

// RXNREL.RRF: RXCUI1|RXAUI1|STYPE1|REL|RXCUI2|RXAUI2|STYPE2|RELA|RUI|SRUI|SAB|SL|RG|DIR|SUPPRESS|CVF
// Row reads "RXCUI2 <RELA> RXCUI1".
const relFixture = [
  // tradename_of BN → IN: "BN tradename_of IN"
  '36567||CUI|RN|196503||CUI|tradename_of|R01||RXNORM|||||4096|',
  '11289||CUI|RN|202421||CUI|tradename_of|R02||RXNORM|||||4096|',
  // ingredient_of IN → SCDC: "IN ingredient_of SCDC"
  '316672||CUI|RO|36567||CUI|ingredient_of|R10||RXNORM|||||4096|',
  '316986||CUI|RO|11289||CUI|ingredient_of|R11||RXNORM|||||4096|',
  // consists_of SCD/SBD → SCDC: "SCD consists_of SCDC"
  '316672||CUI|RO|314231||CUI|consists_of|R20||RXNORM|||||4096|',
  '316672||CUI|RO|104490||CUI|consists_of|R21||RXNORM|||||4096|',
  '316986||CUI|RO|855333||CUI|consists_of|R22||RXNORM|||||4096|',
  '316986||CUI|RO|855334||CUI|consists_of|R23||RXNORM|||||4096|',
  // has_tradename SCD → SBD: "SCD has_tradename SBD"
  '104490||CUI|RB|314231||CUI|has_tradename|R30||RXNORM|||||4096|',
  '855334||CUI|RB|855333||CUI|has_tradename|R31||RXNORM|||||4096|',
  // Non-RXNORM row must be ignored
  '99999||CUI|RN|999998||CUI|tradename_of|R99||SNOMEDCT_US|||||4096|',
].join('\n')

// RXNSAT.RRF: RXCUI|LUI|SUI|RXAUI|STYPE|CODE|ATUI|SATUI|ATN|SAB|ATV|SUPPRESS|CVF
const satFixture = [
  // NDCs on the SCD for simvastatin 10 MG tablet
  '314231|||0050|AUI|314231|||NDC|RXNORM|00006074031|N|4096|',
  '314231|||0051|AUI|314231|||NDC|RXNORM|00006074068|N|4096|',
  // NDC on the SBD (Zocor 10MG)
  '104490|||0052|AUI|104490|||NDC|RXNORM|00006074061|N|4096|',
  // NDC on warfarin SCD
  '855333|||0053|AUI|855333|||NDC|RXNORM|00056017175|N|4096|',
  // Non-RXNORM NDC row — must be ignored
  '314231|||0054|AUI|314231|||NDC|VANDF|000000000001|N|4096|',
  // Non-NDC attribute on RXNORM — must be ignored
  '314231|||0055|AUI|314231|||RXN_AVAILABLE_STRENGTH|RXNORM|10 MG|N|4096|',
].join('\n')

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rxnorm-id-test-'))
  consoPath = join(tmpDir, 'RXNCONSO.RRF')
  relPath = join(tmpDir, 'RXNREL.RRF')
  satPath = join(tmpDir, 'RXNSAT.RRF')
  writeFileSync(consoPath, consoFixture, 'utf-8')
  writeFileSync(relPath, relFixture, 'utf-8')
  writeFileSync(satPath, satFixture, 'utf-8')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadIdentifierIndex', () => {
  it('maps ingredient RxCUI to its primary ATC code (SAB=ATC, TTY=IN)', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    expect(idx.get('36567')?.atc).toBe('C10AA01')
    expect(idx.get('11289')?.atc).toBe('B01AA03')
  })

  it('ignores duplicate ATC rows beyond the first and non-IN TTY rows', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    expect(idx.get('11289')?.atc).toBe('B01AA03')
  })

  it('collects brand names for each ingredient via tradename_of on IN', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    expect(idx.get('36567')?.brand_names).toEqual(['Zocor'])
    expect(idx.get('11289')?.brand_names).toEqual(['Coumadin'])
  })

  it('collects NDCs attached to SCD descendants via ingredient → SCDC → SCD', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    expect(idx.get('36567')?.ndc).toEqual(
      expect.arrayContaining(['00006074031', '00006074068']),
    )
    expect(idx.get('11289')?.ndc).toEqual(['00056017175'])
  })

  it('collects NDCs attached to SBD descendants via ingredient → SCDC → SBD', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    // 00006074061 sits on SBD 104490 (Zocor 10MG), reached via SCDC 316672 → consists_of 104490
    expect(idx.get('36567')?.ndc).toContain('00006074061')
  })

  it('ignores NDC attributes whose SAB is not RXNORM', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    expect(idx.get('36567')?.ndc).not.toContain('000000000001')
  })

  it('ignores non-NDC attributes on RXNORM', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    const allNdcs = [...(idx.get('36567')?.ndc ?? []), ...(idx.get('11289')?.ndc ?? [])]
    expect(allNdcs).not.toContain('10 MG')
  })

  it('ignores relationships outside SAB=RXNORM', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    expect(idx.has('99999')).toBe(false)
  })

  it('returns sorted brand_names and ndc arrays', async () => {
    const idx = await loadIdentifierIndex({ consoPath, relPath, satPath })
    const simva = idx.get('36567')
    if (!simva) throw new Error('missing simvastatin')
    expect([...simva.ndc].sort()).toEqual(simva.ndc)
    expect([...simva.brand_names].sort()).toEqual(simva.brand_names)
  })
})
