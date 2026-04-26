import { describe, it, expect } from 'vitest'
import { tokenizeSentences } from '../tokenize.js'

describe('tokenizeSentences', () => {
  it('returns an empty array for empty input', () => {
    expect(tokenizeSentences('')).toEqual([])
  })

  it('splits on sentence-ending punctuation followed by a capital letter', () => {
    const out = tokenizeSentences(
      'Concomitant use with warfarin may increase bleeding risk. Monitor INR closely.',
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatch(/warfarin/)
    expect(out[1]).toMatch(/^Monitor/)
  })

  it('handles paragraph breaks as additional splits', () => {
    const out = tokenizeSentences(
      'First paragraph sentence.\n\nSecond paragraph sentence one. Second paragraph sentence two.',
    )
    expect(out).toHaveLength(3)
  })

  it('filters out empty fragments', () => {
    const out = tokenizeSentences('One.\n\n\n  \n\nTwo.')
    expect(out).toEqual(['One.', 'Two.'])
  })
})
