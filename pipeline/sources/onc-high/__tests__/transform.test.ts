import { describe, it, expect } from 'vitest'
import { transformEntry } from '../transform.js'
import type { OncHighEntry } from '../types.js'

const warfarinAspirin: OncHighEntry = {
  drug1: { rxcui: '11289', name: 'warfarin' },
  drug2: { rxcui: '1191', name: 'aspirin' },
  severity: 'serious',
  mechanism:
    'Aspirin inhibits platelet aggregation and may displace warfarin from plasma protein binding, increasing anticoagulant effect and bleeding risk.',
  management:
    'Avoid concurrent use. If combination is necessary, monitor INR closely and watch for signs of bleeding.',
  source: {
    name: 'ONCHigh',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3817532/',
    type: 'clinical_guideline',
    accessed_date: '2026-04-15',
  },
}

const significantEntry: OncHighEntry = {
  drug1: { rxcui: '2551', name: 'ciprofloxacin' },
  drug2: { rxcui: '1897158', name: 'calcium carbonate' },
  severity: 'significant',
  mechanism:
    'Divalent cations chelate fluoroquinolones in the gut, reducing absorption by up to 50%.',
  management:
    'Separate administration by at least 2 hours. Take ciprofloxacin 2 hours before or 6 hours after calcium-containing products.',
  source: {
    name: 'ONCHigh',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3817532/',
    type: 'clinical_guideline',
    accessed_date: '2026-04-15',
  },
}

describe('transformEntry', () => {
  it('passes severity values through unchanged for contraindicated/serious/minor/monitor', () => {
    const result = transformEntry(warfarinAspirin)
    expect(result.severity).toBe('serious')
  })

  it('maps ONCHigh "significant" to canonical "moderate"', () => {
    const result = transformEntry(significantEntry)
    expect(result.severity).toBe('moderate')
  })

  it('preserves drug identifiers', () => {
    const result = transformEntry(warfarinAspirin)
    expect(result.drug1.rxcui).toBe('11289')
    expect(result.drug2.rxcui).toBe('1191')
  })

  it('wraps single source in sources array', () => {
    const result = transformEntry(warfarinAspirin)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.name).toBe('ONCHigh')
  })

  it('sets isGenerated to false and confidence to null', () => {
    const result = transformEntry(warfarinAspirin)
    expect(result.isGenerated).toBe(false)
    expect(result.confidence).toBeNull()
  })
})
