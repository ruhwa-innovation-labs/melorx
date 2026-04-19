import { describe, expect, it } from 'vitest'
import {
  mergeIdentifiers,
  identifiersEqual,
  EMPTY_IDENTIFIERS,
} from '../merge-identifiers.js'

describe('mergeIdentifiers', () => {
  it('returns null when no incoming identifiers are provided', () => {
    expect(mergeIdentifiers(undefined, undefined)).toBeNull()
    expect(mergeIdentifiers(EMPTY_IDENTIFIERS, undefined)).toBeNull()
  })

  it('fills ATC when existing is null', () => {
    const merged = mergeIdentifiers(EMPTY_IDENTIFIERS, {
      atc: 'C10AA01',
      brand_names: [],
      ndc: [],
    })
    expect(merged?.atc).toBe('C10AA01')
  })

  it('preserves existing ATC when set — never clobbers', () => {
    const merged = mergeIdentifiers(
      { ...EMPTY_IDENTIFIERS, atc: 'M01AE01' },
      { atc: 'C10AA01', brand_names: [], ndc: [] },
    )
    expect(merged?.atc).toBe('M01AE01')
  })

  it('unions brand_names and sorts', () => {
    const merged = mergeIdentifiers(
      { ...EMPTY_IDENTIFIERS, brand_names: ['Zocor'] },
      { atc: null, brand_names: ['Vytorin', 'Zocor', 'Flolipid'], ndc: [] },
    )
    expect(merged?.brand_names).toEqual(['Flolipid', 'Vytorin', 'Zocor'])
  })

  it('unions and sorts NDCs', () => {
    const merged = mergeIdentifiers(
      { ...EMPTY_IDENTIFIERS, ndc: ['00006074031'] },
      { atc: null, brand_names: [], ndc: ['00006074068', '00006074031'] },
    )
    expect(merged?.ndc).toEqual(['00006074031', '00006074068'])
  })

  it('never overwrites drugbank (incoming always lacks it)', () => {
    const merged = mergeIdentifiers(
      { ...EMPTY_IDENTIFIERS, drugbank: 'DB00641' },
      { atc: 'C10AA01', brand_names: [], ndc: [] },
    )
    expect(merged?.drugbank).toBe('DB00641')
  })
})

describe('identifiersEqual', () => {
  it('returns false when existing is undefined', () => {
    expect(identifiersEqual(undefined, EMPTY_IDENTIFIERS)).toBe(false)
  })

  it('returns true for identical shapes', () => {
    const v = { ...EMPTY_IDENTIFIERS, atc: 'C10AA01', brand_names: ['Zocor'] }
    expect(identifiersEqual(v, { ...v })).toBe(true)
  })

  it('returns false when ATC differs', () => {
    expect(
      identifiersEqual(
        { ...EMPTY_IDENTIFIERS, atc: 'A' },
        { ...EMPTY_IDENTIFIERS, atc: 'B' },
      ),
    ).toBe(false)
  })

  it('returns false when brand_names differ in order or values', () => {
    expect(
      identifiersEqual(
        { ...EMPTY_IDENTIFIERS, brand_names: ['Zocor', 'Vytorin'] },
        { ...EMPTY_IDENTIFIERS, brand_names: ['Vytorin', 'Zocor'] },
      ),
    ).toBe(false)
  })

  it('returns false when NDC sets differ', () => {
    expect(
      identifiersEqual(
        { ...EMPTY_IDENTIFIERS, ndc: ['001'] },
        { ...EMPTY_IDENTIFIERS, ndc: ['001', '002'] },
      ),
    ).toBe(false)
  })
})
