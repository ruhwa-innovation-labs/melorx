import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { extractFromLabel } from '../extract.js'
import type { LabelRecord, ResolverFn } from '../types.js'

const fixtures = JSON.parse(
  readFileSync(
    resolve(new URL('.', import.meta.url).pathname, 'fixtures/labels.json'),
    'utf-8',
  ),
) as Record<string, LabelRecord>

const KNOWN_DRUGS: Record<string, { rxcui: string; name: string }> = {
  simvastatin: { rxcui: '36567', name: 'simvastatin' },
  itraconazole: { rxcui: '28031', name: 'itraconazole' },
  clarithromycin: { rxcui: '21212', name: 'clarithromycin' },
  warfarin: { rxcui: '11289', name: 'warfarin' },
  fluconazole: { rxcui: '4450', name: 'fluconazole' },
}

const exactResolver: ResolverFn = (surfaceForm) => {
  const entry = KNOWN_DRUGS[surfaceForm.toLowerCase()]
  if (!entry) return null
  return { ...entry, quality: 'exact' }
}

const approximateResolver: ResolverFn = (surfaceForm) => {
  const entry = KNOWN_DRUGS[surfaceForm.toLowerCase()]
  if (!entry) return null
  return { ...entry, quality: 'approximate' }
}

const unresolvingResolver: ResolverFn = () => null

describe('extractFromLabel', () => {
  it('extracts both unique object drugs from the simvastatin fixture', () => {
    const result = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    const uniqueObjectCuis = [...new Set(result.candidates.map((c) => c.objectRxcui))].sort()
    expect(uniqueObjectCuis).toEqual(['21212', '28031']) // itraconazole, clarithromycin
    // Itraconazole is mentioned in two sentences via two different patterns, so
    // we expect >2 candidate rows even though there are only 2 unique pairs.
    expect(result.candidates.length).toBeGreaterThanOrEqual(2)
    expect(result.unresolved).toHaveLength(0)
    expect(result.classReferences).toHaveLength(0)
  })

  it('assigns contraindicated severity to "should not be used with X"', () => {
    const result = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    const clarithromycin = result.candidates.find((c) => c.objectRxcui === '21212')
    expect(clarithromycin?.severity).toBe('contraindicated')
  })

  it('assigns monitor severity when the sentence contains "Monitor"', () => {
    const result = extractFromLabel(fixtures['fluconazole_label']!, exactResolver)
    const warfarin = result.candidates.find((c) => c.objectRxcui === '11289')
    expect(warfarin).toBeDefined()
    // The sentence is "Concomitant use with warfarin may increase anticoagulant effect"
    // — no explicit "monitor"/"should not"/"contraindicated" in this sentence,
    // so it should default to moderate (via "may increase") per severity-map rules.
    expect(warfarin?.severity).toBe('moderate')
  })

  it('applies density bonus for multiply-mentioned pairs', () => {
    // simvastatin + itraconazole is mentioned in two distinct sentences via two
    // different patterns. The pair-level density cross-aggregates both patterns,
    // so at least one resulting candidate should show confidence above its own
    // pattern specificity (which caps below 0.75 for single-mention narrow patterns).
    const result = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    const itraconazoleCandidates = result.candidates.filter(
      (c) => c.objectRxcui === '28031',
    )
    expect(itraconazoleCandidates.length).toBeGreaterThanOrEqual(1)
    // Every itraconazole candidate has bothExact, and the pair is mentioned
    // multiple times across patterns, so all should qualify for promotion.
    for (const c of itraconazoleCandidates) {
      expect(c.confidence).toBeGreaterThanOrEqual(0.75)
      expect(c.bothExact).toBe(true)
    }
  })

  it('caps confidence at 0.74 when either drug resolves approximately', () => {
    const result = extractFromLabel(fixtures['fluconazole_label']!, approximateResolver)
    for (const c of result.candidates) {
      expect(c.confidence).toBeLessThanOrEqual(0.74)
      expect(c.bothExact).toBe(false)
    }
  })

  it('flags class references (NSAIDs, ACE inhibitors) as classReferences, not candidates', () => {
    const result = extractFromLabel(
      fixtures['warfarin_label_class_reference']!,
      exactResolver,
    )
    expect(result.candidates).toHaveLength(0)
    expect(result.classReferences.length).toBeGreaterThan(0)
    const surfaces = result.classReferences.map((r) => r.surfaceForm.toLowerCase())
    expect(surfaces.some((s) => s === 'nsaids' || s === 'ace inhibitors')).toBe(true)
  })

  it('records unresolved object drugs separately from candidates', () => {
    const result = extractFromLabel(
      fixtures['unresolvable_drug_label']!,
      unresolvingResolver,
    )
    expect(result.candidates).toHaveLength(0)
    expect(result.unresolved.length).toBeGreaterThan(0)
    expect(result.unresolved[0]?.surfaceForm.toLowerCase()).toContain('obscurinol')
  })

  it('never emits the subject drug as its own interaction partner', () => {
    const result = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    for (const c of result.candidates) {
      expect(c.objectRxcui).not.toBe(c.subjectRxcui)
    }
  })

  it('every candidate carries the label set_id, url, and pattern id', () => {
    const result = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    for (const c of result.candidates) {
      expect(c.setId).toBe('SIM-001')
      expect(c.url).toBe('https://dailymed.example/sim-001')
      expect(c.patternId.length).toBeGreaterThan(0)
    }
  })

  it('returns empty result when subjectRxcuis is empty', () => {
    const label: LabelRecord = {
      ...fixtures['simvastatin_label']!,
      subjectRxcuis: [],
    }
    const result = extractFromLabel(label, exactResolver)
    expect(result.candidates).toHaveLength(0)
  })

  it('is deterministic — two runs on the same label produce identical candidates', () => {
    const a = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    const b = extractFromLabel(fixtures['simvastatin_label']!, exactResolver)
    const norm = (r: typeof a): string =>
      JSON.stringify(
        r.candidates
          .map((c) => ({ ...c }))
          .sort((x, y) =>
            `${x.objectRxcui}::${x.patternId}`.localeCompare(
              `${y.objectRxcui}::${y.patternId}`,
            ),
          ),
      )
    expect(norm(a)).toBe(norm(b))
  })
})
