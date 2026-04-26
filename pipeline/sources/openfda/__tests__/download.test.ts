import AdmZip from 'adm-zip'
import { describe, it, expect } from 'vitest'
import {
  extractLabelsFromZip,
  normaliseChecksum,
  parseDownloadIndex,
  sha256Hex,
  verifyChecksum,
} from '../download.js'

describe('normaliseChecksum', () => {
  it('strips the sha256: prefix and lowercases hex', () => {
    const raw = 'sha256:A3F7' + 'b'.repeat(60)
    expect(normaliseChecksum(raw)).toBe(('a3f7' + 'b'.repeat(60)).toLowerCase())
  })

  it('accepts bare hex', () => {
    const hex = 'a'.repeat(64)
    expect(normaliseChecksum(hex)).toBe(hex)
  })

  it('returns null for invalid hex', () => {
    expect(normaliseChecksum('sha256:nothex')).toBeNull()
    expect(normaliseChecksum('a'.repeat(63))).toBeNull()
    expect(normaliseChecksum('')).toBeNull()
    expect(normaliseChecksum(null)).toBeNull()
    expect(normaliseChecksum(undefined)).toBeNull()
  })

  it('handles the sha-256= format variant', () => {
    const hex = 'f'.repeat(64)
    expect(normaliseChecksum(`sha-256=${hex}`)).toBe(hex)
  })
})

describe('parseDownloadIndex', () => {
  it('returns partition descriptors for a well-formed index', () => {
    const raw = {
      results: {
        drug: {
          label: {
            total_records: 1000,
            partitions: [
              {
                display_name: 'drug label 0001 of 0002',
                records: 500,
                file: 'https://example.test/drug-label-0001-of-0002.json.zip',
                size_mb: 28.4,
                checksum: 'sha256:' + 'a'.repeat(64),
              },
              {
                display_name: 'drug label 0002 of 0002',
                records: 500,
                file: 'https://example.test/drug-label-0002-of-0002.json.zip',
                size_mb: 29.1,
              },
            ],
          },
        },
      },
    }
    const partitions = parseDownloadIndex(raw)
    expect(partitions).toHaveLength(2)
    expect(partitions[0]?.partitionId).toBe('drug-label-0001-of-0002.json.zip')
    expect(partitions[0]?.checksum).toBe('a'.repeat(64))
    expect(partitions[0]?.sizeMb).toBe(28.4)
    expect(partitions[1]?.checksum).toBeNull()
  })

  it('returns an empty array when the index is missing expected fields', () => {
    expect(parseDownloadIndex({})).toEqual([])
    expect(parseDownloadIndex({ results: {} })).toEqual([])
    expect(parseDownloadIndex({ results: { drug: { label: {} } } })).toEqual([])
  })

  it('skips partitions with no file URL', () => {
    const raw = {
      results: {
        drug: {
          label: {
            partitions: [{ display_name: 'bogus' }, { file: 'https://x.test/a.json.zip' }],
          },
        },
      },
    }
    expect(parseDownloadIndex(raw)).toHaveLength(1)
  })
})

describe('verifyChecksum', () => {
  const buffer = Buffer.from('hello melorx')
  const expected = sha256Hex(buffer)

  it('returns ok=true when the hashes match', () => {
    expect(verifyChecksum(buffer, expected)).toEqual({
      ok: true,
      actual: expected,
      expected,
    })
  })

  it('returns ok=false when the hashes differ', () => {
    const result = verifyChecksum(buffer, 'a'.repeat(64))
    expect(result.ok).toBe(false)
    expect(result.actual).toBe(expected)
  })

  it('returns ok=false (with expected=null) when no checksum was published', () => {
    expect(verifyChecksum(buffer, null)).toEqual({
      ok: false,
      actual: expected,
      expected: null,
    })
  })
})

describe('extractLabelsFromZip', () => {
  function buildZip(jsonContent: string, entryName = 'drug-label-0001-of-0002.json'): Buffer {
    const zip = new AdmZip()
    zip.addFile(entryName, Buffer.from(jsonContent, 'utf-8'))
    return zip.toBuffer()
  }

  it('extracts the results[] array from a well-formed partition ZIP', () => {
    const json = JSON.stringify({
      meta: { disclaimer: 'test' },
      results: [{ set_id: 'abc' }, { set_id: 'def' }],
    })
    const labels = extractLabelsFromZip(buildZip(json))
    expect(labels).toHaveLength(2)
    expect(labels[0]?.set_id).toBe('abc')
  })

  it('throws when the zip is empty', () => {
    const zip = new AdmZip()
    expect(() => extractLabelsFromZip(zip.toBuffer())).toThrow(/empty/i)
  })

  it('throws when the JSON lacks results[]', () => {
    expect(() =>
      extractLabelsFromZip(buildZip(JSON.stringify({ meta: {} }))),
    ).toThrow(/results/)
  })

  it('throws with a clear message when the JSON is malformed', () => {
    expect(() => extractLabelsFromZip(buildZip('{not json'))).toThrow(/parse failed/)
  })
})
