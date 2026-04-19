import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { classRulesFileSchema } from '../class-schemas.js'
import { toClassInteractionRows } from '../class-transform.js'
import type { ClassRulesFile } from '../class-types.js'

const singleRuleFixture: ClassRulesFile = {
  source: {
    name: 'ONCHigh',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3422823/',
    type: 'clinical_guideline',
    accessed_date: '2026-04-18',
    citation: 'Phansalkar S et al. JAMIA 2012',
  },
  deferred_rules: [],
  rules: [
    {
      rule_number: 6,
      object_class: 'Febuxostat',
      object_drugs: ['Febuxostat'],
      precipitant_groups: [
        { class: 'Thiopurines', drugs: ['Azathioprine', 'Mercaptopurine'] },
      ],
      severity: 'contraindicated',
      mechanism: 'XO inhibition elevates thiopurine exposure.',
      management: 'Concurrent use is contraindicated per prescribing information.',
    },
  ],
}

const multiGroupFixture: ClassRulesFile = {
  source: singleRuleFixture.source,
  deferred_rules: [],
  rules: [
    {
      rule_number: 25,
      object_class: 'Simvastatin and lovastatin',
      object_drugs: ['Simvastatin', 'Lovastatin'],
      precipitant_groups: [
        { class: 'CYP3A4 inhibitors (macrolides)', drugs: ['Clarithromycin'] },
        { class: 'CYP3A4 inhibitors (azoles)', drugs: ['Itraconazole'] },
        { class: 'CYP3A4 inhibitors (protease inhibitors)', drugs: ['Ritonavir'] },
      ],
      severity: 'contraindicated',
      mechanism: 'CYP3A4 inhibition elevates statin exposure.',
      management: 'Concurrent use is contraindicated per prescribing information.',
    },
  ],
}

describe('toClassInteractionRows', () => {
  it('emits one row per precipitant group', () => {
    const rows = toClassInteractionRows(multiGroupFixture)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.class_b)).toEqual([
      'CYP3A4 inhibitors (macrolides)',
      'CYP3A4 inhibitors (azoles)',
      'CYP3A4 inhibitors (protease inhibitors)',
    ])
  })

  it('sets class_a to the rule object_class for every emitted row', () => {
    const rows = toClassInteractionRows(multiGroupFixture)
    expect(rows.every((r) => r.class_a === 'Simvastatin and lovastatin')).toBe(true)
  })

  it('propagates severity, mechanism, and management to each row', () => {
    const rows = toClassInteractionRows(singleRuleFixture)
    expect(rows[0]?.severity).toBe('contraindicated')
    expect(rows[0]?.mechanism).toMatch(/thiopurine/)
    expect(rows[0]?.management).toMatch(/contraindicated/)
  })

  it('wraps the file source in a sources array without the citation field', () => {
    const rows = toClassInteractionRows(singleRuleFixture)
    expect(rows[0]?.sources).toHaveLength(1)
    expect(rows[0]?.sources[0]).toEqual({
      name: 'ONCHigh',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3422823/',
      type: 'clinical_guideline',
      accessed_date: '2026-04-18',
    })
  })
})

describe('class-rules.json dataset', () => {
  const rulesPath = resolve(
    new URL('.', import.meta.url).pathname,
    '../data/class-rules.json',
  )
  const raw: unknown = JSON.parse(readFileSync(rulesPath, 'utf-8'))
  const file = classRulesFileSchema.parse(raw)

  it('parses cleanly against the schema', () => {
    expect(file.rules.length).toBeGreaterThan(0)
  })

  it('transcribes 14 accepted rules with rule 21 (QT x QT) deferred', () => {
    expect(file.rules).toHaveLength(14)
    expect(file.deferred_rules.map((r) => r.rule_number)).toEqual([21])
  })

  it('every rule has a severity drawn from the canonical enum', () => {
    const allowed = ['contraindicated', 'serious', 'moderate', 'minor', 'monitor']
    for (const rule of file.rules) {
      expect(allowed).toContain(rule.severity)
    }
  })

  it('expands to a deterministic number of (class_a, class_b) rows', () => {
    const rows = toClassInteractionRows(file)
    const expected = file.rules.reduce(
      (acc, r) => acc + r.precipitant_groups.length,
      0,
    )
    expect(rows).toHaveLength(expected)
  })

  it('produces unique (class_a, class_b) row keys', () => {
    const rows = toClassInteractionRows(file)
    const keys = rows.map((r) => `${r.class_a}||${r.class_b}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
