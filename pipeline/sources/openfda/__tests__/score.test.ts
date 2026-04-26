import { describe, it, expect } from 'vitest'
import { scoreCandidate } from '../score.js'

describe('scoreCandidate', () => {
  it('returns the pattern specificity for a single occurrence with both-exact resolution', () => {
    expect(
      scoreCandidate({ patternSpecificity: 0.5, occurrencesInLabel: 1, bothExact: true }),
    ).toBe(0.65)
  })

  it('applies a density bonus of 0.05 per additional occurrence, capped at 0.2', () => {
    expect(
      scoreCandidate({ patternSpecificity: 0.4, occurrencesInLabel: 3, bothExact: true }),
    ).toBeCloseTo(0.65, 2) // 0.4 + 0.1 + 0.15

    expect(
      scoreCandidate({ patternSpecificity: 0.4, occurrencesInLabel: 10, bothExact: true }),
    ).toBeCloseTo(0.75, 2) // 0.4 + 0.2 cap + 0.15
  })

  it('applies +0.15 when both drugs resolve exactly', () => {
    const withBoth = scoreCandidate({
      patternSpecificity: 0.6,
      occurrencesInLabel: 1,
      bothExact: true,
    })
    const withoutBoth = scoreCandidate({
      patternSpecificity: 0.6,
      occurrencesInLabel: 1,
      bothExact: false,
    })
    expect(withBoth - withoutBoth).toBeCloseTo(0.15, 2)
  })

  it('caps confidence at 0.74 when either drug resolves approximately', () => {
    // 0.9 + 0.0 bonus + 0.0 exact = 0.9, but capped because bothExact=false
    expect(
      scoreCandidate({ patternSpecificity: 0.9, occurrencesInLabel: 5, bothExact: false }),
    ).toBe(0.74)
  })

  it('clips final score into [0, 1]', () => {
    expect(
      scoreCandidate({ patternSpecificity: 1.0, occurrencesInLabel: 100, bothExact: true }),
    ).toBe(1)
  })

  it('rejects invalid specificity', () => {
    expect(() =>
      scoreCandidate({ patternSpecificity: 1.5, occurrencesInLabel: 1, bothExact: true }),
    ).toThrow(RangeError)
    expect(() =>
      scoreCandidate({ patternSpecificity: -0.1, occurrencesInLabel: 1, bothExact: true }),
    ).toThrow(RangeError)
  })

  it('rejects occurrencesInLabel < 1', () => {
    expect(() =>
      scoreCandidate({ patternSpecificity: 0.5, occurrencesInLabel: 0, bothExact: true }),
    ).toThrow(RangeError)
  })

  it('is deterministic across runs', () => {
    const inputs = { patternSpecificity: 0.6, occurrencesInLabel: 2, bothExact: true }
    const a = scoreCandidate(inputs)
    const b = scoreCandidate(inputs)
    const c = scoreCandidate(inputs)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('rule #6 boundary: a tight pattern with both-exact hits ≥ 0.75 threshold', () => {
    // CONCOMITANT_USE_V1 specificity = 0.6; both-exact +0.15 = 0.75 (auto-promote boundary)
    expect(
      scoreCandidate({ patternSpecificity: 0.6, occurrencesInLabel: 1, bothExact: true }),
    ).toBe(0.75)
  })
})
