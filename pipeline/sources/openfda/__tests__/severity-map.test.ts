import { describe, it, expect } from 'vitest'
import { inferSeverity } from '../severity-map.js'

describe('inferSeverity', () => {
  it('maps "contraindicated" to contraindicated', () => {
    expect(
      inferSeverity('Concurrent use of X with ketoconazole is contraindicated.'),
    ).toBe('contraindicated')
  })

  it('maps "should not be used" to contraindicated', () => {
    expect(
      inferSeverity('This drug should not be used with simvastatin.'),
    ).toBe('contraindicated')
  })

  it('maps "avoid" to serious', () => {
    expect(inferSeverity('Avoid concurrent use with rifampin.')).toBe('serious')
  })

  it('maps "fatal" to serious', () => {
    expect(
      inferSeverity('Fatal cases have been reported when combined with warfarin.'),
    ).toBe('serious')
  })

  it('maps "monitor" to monitor', () => {
    expect(inferSeverity('Monitor patients closely when co-administering.')).toBe('monitor')
  })

  it('maps "increases plasma levels" to moderate', () => {
    expect(
      inferSeverity('Co-administration increases plasma levels of simvastatin.'),
    ).toBe('moderate')
  })

  it('maps "no clinically significant" to minor', () => {
    expect(
      inferSeverity('No clinically significant interaction was observed.'),
    ).toBe('minor')
  })

  it('favours higher severity when multiple keywords appear (contraindicated > monitor)', () => {
    expect(
      inferSeverity(
        'The combination is contraindicated; monitor patients if the combination is unavoidable.',
      ),
    ).toBe('contraindicated')
  })

  it('defaults to moderate when no keyword matches', () => {
    expect(inferSeverity('A pharmacokinetic study was performed.')).toBe('moderate')
  })
})
