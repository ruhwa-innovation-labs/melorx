import { describe, it, expect } from 'vitest'
import { toLabelRecord, type OpenFdaLabelJson } from '../parse-label.js'

describe('toLabelRecord', () => {
  const fullRecord: OpenFdaLabelJson = {
    set_id: 'abc-123',
    effective_time: '20260115',
    openfda: {
      rxcui: ['36567', '196503'],
      generic_name: ['simvastatin'],
      brand_name: ['Zocor'],
    },
    drug_interactions: [
      'Concomitant use with itraconazole may increase plasma levels.',
      'Simvastatin should not be used with clarithromycin.',
    ],
  }

  it('maps all required fields from a complete label JSON', () => {
    const record = toLabelRecord(fullRecord)
    expect(record).not.toBeNull()
    expect(record?.set_id).toBe('abc-123')
    expect(record?.effective_time).toBe('2026-01-15')
    expect(record?.subjectRxcuis).toEqual(['36567', '196503'])
    expect(record?.subjectName).toBe('simvastatin')
    expect(record?.url).toContain('setid=abc-123')
    expect(record?.interactionsText).toContain('itraconazole')
    expect(record?.interactionsText).toContain('clarithromycin')
  })

  it('returns null when rxcui array is missing or empty', () => {
    expect(toLabelRecord({ ...fullRecord, openfda: {} })).toBeNull()
    expect(toLabelRecord({ ...fullRecord, openfda: { rxcui: [] } })).toBeNull()
  })

  it('returns null when drug_interactions is missing', () => {
    const { drug_interactions: _omit, ...withoutInteractions } = fullRecord
    expect(toLabelRecord(withoutInteractions)).toBeNull()
    expect(toLabelRecord({ ...fullRecord, drug_interactions: [] })).toBeNull()
  })

  it('falls back to brand_name when generic_name is missing', () => {
    const record = toLabelRecord({
      ...fullRecord,
      openfda: { rxcui: ['1'], brand_name: ['Zocor'] },
    })
    expect(record?.subjectName).toBe('zocor')
  })

  it('normalises effective_time from YYYYMMDD to YYYY-MM-DD', () => {
    const record = toLabelRecord({
      ...fullRecord,
      effective_time: '20260115',
    })
    expect(record?.effective_time).toBe('2026-01-15')
  })

  it('sets effective_time to null when the upstream value is malformed', () => {
    expect(toLabelRecord({ ...fullRecord, effective_time: '2026-1-1' })?.effective_time).toBeNull()
    const { effective_time: _et, ...withoutEt } = fullRecord
    expect(toLabelRecord(withoutEt)?.effective_time).toBeNull()
  })

  it('uses spl_set_id as a fallback when set_id is missing', () => {
    const { set_id: _id, ...withoutSetId } = fullRecord
    const record = toLabelRecord({
      ...withoutSetId,
      openfda: {
        rxcui: ['36567'],
        generic_name: ['simvastatin'],
        spl_set_id: ['fallback-123'],
      },
    })
    expect(record?.set_id).toBe('fallback-123')
  })

  it('returns null when neither set_id nor spl_set_id is available', () => {
    const { set_id: _id, ...withoutSetId } = fullRecord
    expect(
      toLabelRecord({
        ...withoutSetId,
        openfda: { rxcui: ['36567'], generic_name: ['simvastatin'] },
      }),
    ).toBeNull()
  })

  it('joins multi-element drug_interactions into a single block', () => {
    const record = toLabelRecord(fullRecord)
    expect(record?.interactionsText.split('\n\n')).toHaveLength(2)
  })
})
