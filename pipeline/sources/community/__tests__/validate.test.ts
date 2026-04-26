import { describe, it, expect } from 'vitest'
import { validateFiles, canonicalPairKey, expectedFilename } from '../validate.js'
import type { CommunityEntry } from '../schemas.js'

const VALID_ENTRY = {
  drug1: { rxcui: '11289', name: 'warfarin' },
  drug2: { rxcui: '4450', name: 'fluconazole' },
  severity: 'serious',
  mechanism:
    'Fluconazole inhibits CYP2C9, increasing warfarin plasma levels and bleeding risk.',
  management: 'Monitor INR closely when starting or stopping fluconazole; reduce warfarin dose as needed.',
  sources: [
    {
      name: 'Package insert (fluconazole)',
      url: 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2014/019949s061lbl.pdf',
      type: 'fda_label',
      accessed_date: '2026-04-20',
    },
  ],
  submitted_by: { name: 'Test Author', github: 'test-author' },
} satisfies CommunityEntry

function file(name: string, entry: unknown): { file: string; content: string } {
  return { file: name, content: JSON.stringify(entry) }
}

describe('canonicalPairKey', () => {
  it('orders rxcuis lexicographically (lowest first)', () => {
    expect(canonicalPairKey('11289', '4450')).toBe('11289-4450')
    expect(canonicalPairKey('4450', '11289')).toBe('11289-4450')
  })

  it('is stable regardless of input order', () => {
    expect(canonicalPairKey('1', '2')).toBe(canonicalPairKey('2', '1'))
  })
})

describe('expectedFilename', () => {
  it('derives canonical filename from the entry pair', () => {
    expect(expectedFilename(VALID_ENTRY)).toBe('11289-4450.json')
  })
})

describe('validateFiles', () => {
  it('accepts a single well-formed entry', () => {
    const result = validateFiles([file('11289-4450.json', VALID_ENTRY)])
    expect(result.issues).toEqual([])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.entry.severity).toBe('serious')
  })

  it('rejects a file with invalid JSON', () => {
    const result = validateFiles([{ file: 'x.json', content: '{not json' }])
    expect(result.entries).toHaveLength(0)
    expect(result.issues[0]?.message).toMatch(/invalid JSON/)
  })

  it('rejects missing sources', () => {
    const result = validateFiles([
      file('11289-4450.json', { ...VALID_ENTRY, sources: [] }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path === 'sources')).toBe(true)
  })

  it('rejects a non-canonical severity string', () => {
    const result = validateFiles([
      file('11289-4450.json', { ...VALID_ENTRY, severity: 'major' }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path === 'severity')).toBe(true)
  })

  it('rejects non-numeric rxcui', () => {
    const result = validateFiles([
      file('abc-4450.json', {
        ...VALID_ENTRY,
        drug1: { rxcui: 'abc', name: 'fake' },
      }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path === 'drug1.rxcui')).toBe(true)
  })

  it('rejects self-interaction (same rxcui on both drugs)', () => {
    const result = validateFiles([
      file('11289-11289.json', {
        ...VALID_ENTRY,
        drug2: { rxcui: '11289', name: 'warfarin' },
      }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.message.includes('must differ'))).toBe(true)
  })

  it('rejects an invalid source URL', () => {
    const result = validateFiles([
      file('11289-4450.json', {
        ...VALID_ENTRY,
        sources: [{ ...VALID_ENTRY.sources[0], url: 'not-a-url' }],
      }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path.startsWith('sources'))).toBe(true)
  })

  it('rejects an invalid source type', () => {
    const result = validateFiles([
      file('11289-4450.json', {
        ...VALID_ENTRY,
        sources: [{ ...VALID_ENTRY.sources[0], type: 'wikipedia' }],
      }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path.startsWith('sources'))).toBe(true)
  })

  it('rejects a non-ISO accessed_date', () => {
    const result = validateFiles([
      file('11289-4450.json', {
        ...VALID_ENTRY,
        sources: [{ ...VALID_ENTRY.sources[0], accessed_date: '04/20/2026' }],
      }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path.startsWith('sources'))).toBe(true)
  })

  it('rejects duplicate pairs across files (regardless of drug order)', () => {
    const swapped = {
      ...VALID_ENTRY,
      drug1: VALID_ENTRY.drug2,
      drug2: VALID_ENTRY.drug1,
    }
    const result = validateFiles([
      file('11289-4450.json', VALID_ENTRY),
      file('11289-4450-copy.json', swapped),
    ])
    expect(result.issues.some((i) => i.message.includes('duplicate pair'))).toBe(true)
  })

  it('rejects a filename that does not match canonical form', () => {
    const result = validateFiles([file('4450-11289.json', VALID_ENTRY)])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.message.includes('filename must be'))).toBe(true)
  })

  it('allows mechanism and management to be null', () => {
    const result = validateFiles([
      file('11289-4450.json', { ...VALID_ENTRY, mechanism: null, management: null }),
    ])
    expect(result.issues).toEqual([])
    expect(result.entries[0]?.entry.mechanism).toBeNull()
  })

  it('accumulates issues across multiple bad files without short-circuiting', () => {
    const result = validateFiles([
      file('11289-4450.json', { ...VALID_ENTRY, sources: [] }),
      file('36567-703.json', { ...VALID_ENTRY, severity: 'major' }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('accepts a github handle with hyphens and alphanumerics', () => {
    const result = validateFiles([
      file('11289-4450.json', {
        ...VALID_ENTRY,
        submitted_by: { name: 'Doctor X', github: 'dr-x-md-42' },
      }),
    ])
    expect(result.issues).toEqual([])
  })

  it('rejects a github handle with invalid characters', () => {
    const result = validateFiles([
      file('11289-4450.json', {
        ...VALID_ENTRY,
        submitted_by: { name: 'Doctor X', github: 'invalid handle!' },
      }),
    ])
    expect(result.entries).toHaveLength(0)
    expect(result.issues.some((i) => i.path.includes('github'))).toBe(true)
  })
})
