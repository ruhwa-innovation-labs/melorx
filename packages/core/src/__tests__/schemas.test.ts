import { describe, it, expect } from 'vitest'
import { severitySchema, interactionQuerySchema, resolveQuerySchema } from '../schemas/interaction.schema.js'

describe('severitySchema', () => {
  it('accepts all five canonical severity values', () => {
    expect(severitySchema.parse('contraindicated')).toBe('contraindicated')
    expect(severitySchema.parse('serious')).toBe('serious')
    expect(severitySchema.parse('moderate')).toBe('moderate')
    expect(severitySchema.parse('minor')).toBe('minor')
    expect(severitySchema.parse('monitor')).toBe('monitor')
  })

  it('rejects non-canonical severity strings', () => {
    expect(() => severitySchema.parse('major')).toThrow()
    expect(() => severitySchema.parse('severe')).toThrow()
    expect(() => severitySchema.parse('significant')).toThrow()
    expect(() => severitySchema.parse('')).toThrow()
  })
})

describe('interactionQuerySchema', () => {
  it('accepts two drug identifiers', () => {
    const result = interactionQuerySchema.parse({ drug1: '5640', drug2: '29046' })
    expect(result.drug1).toBe('5640')
    expect(result.drug2).toBe('29046')
  })

  it('rejects when drug2 is missing', () => {
    expect(() => interactionQuerySchema.parse({ drug1: '5640' })).toThrow()
  })

  it('rejects empty strings', () => {
    expect(() => interactionQuerySchema.parse({ drug1: '', drug2: '29046' })).toThrow()
  })
})

describe('resolveQuerySchema', () => {
  it('accepts a drug name query', () => {
    const result = resolveQuerySchema.parse({ q: 'ibuprofen' })
    expect(result.q).toBe('ibuprofen')
  })

  it('rejects an empty query', () => {
    expect(() => resolveQuerySchema.parse({ q: '' })).toThrow()
  })
})
