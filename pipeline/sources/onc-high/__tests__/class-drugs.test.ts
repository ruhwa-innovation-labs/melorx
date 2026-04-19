import { describe, expect, it } from 'vitest'
import { collectDrugMemberships } from '../class-drugs.js'
import type { ClassRulesFile } from '../class-types.js'

const fixture: ClassRulesFile = {
  source: {
    name: 'ONCHigh',
    url: 'https://example.com/',
    type: 'clinical_guideline',
    accessed_date: '2026-04-18',
    citation: 'test',
  },
  deferred_rules: [],
  rules: [
    {
      rule_number: 23,
      object_class: 'HIV protease inhibitors',
      object_drugs: ['Ritonavir', 'Lopinavir'],
      precipitant_groups: [
        {
          class: 'Strong CYP3A4 inducers',
          drugs: ['Rifampin'],
        },
      ],
      severity: 'serious',
      mechanism: 'x',
      management: 'y',
    },
    {
      rule_number: 11,
      object_class: 'Irinotecan',
      object_drugs: ['Irinotecan'],
      precipitant_groups: [
        {
          class: 'CYP3A4 inhibitors (protease inhibitors)',
          drugs: ['Ritonavir'],
        },
      ],
      severity: 'serious',
      mechanism: 'x',
      management: 'y',
    },
  ],
}

describe('collectDrugMemberships', () => {
  it('collects each drug with the full set of classes it appears under', () => {
    const m = collectDrugMemberships(fixture)
    const ritonavir = m.get('Ritonavir')
    expect(ritonavir).toBeDefined()
    expect([...(ritonavir ?? [])].sort()).toEqual(
      ['CYP3A4 inhibitors (protease inhibitors)', 'HIV protease inhibitors'].sort(),
    )
  })

  it('records object-side drugs under the rule object_class', () => {
    const m = collectDrugMemberships(fixture)
    expect([...(m.get('Lopinavir') ?? [])]).toEqual(['HIV protease inhibitors'])
    expect([...(m.get('Irinotecan') ?? [])]).toEqual(['Irinotecan'])
  })

  it('records precipitant drugs under the precipitant group class', () => {
    const m = collectDrugMemberships(fixture)
    expect([...(m.get('Rifampin') ?? [])]).toEqual(['Strong CYP3A4 inducers'])
  })
})
