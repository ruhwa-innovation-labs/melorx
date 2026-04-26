/**
 * Sentence tokenization for FDA label narrative text using Natural.js.
 *
 * Per ADR-004, Natural.js's SentenceTokenizer handles FDA label grammar
 * reliably. Tokenization runs per label, not per session, so the startup
 * cost of loading Natural is amortised across thousands of sentences.
 *
 * Paragraph splits are handled first so that multi-paragraph labels do not
 * bleed sentences across structural boundaries.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- natural has no bundled types; typing the one export we use.
import natural from 'natural'

const PARAGRAPH_SPLIT = /\n+/

interface SentenceTokenizerCtor {
  new (abbreviations?: string[]): { tokenize(text: string): string[] }
}

const SentenceTokenizer = (natural as { SentenceTokenizer: SentenceTokenizerCtor })
  .SentenceTokenizer

const tokenizer = new SentenceTokenizer([])

export function tokenizeSentences(text: string): string[] {
  if (!text) return []
  const out: string[] = []
  for (const p of text.split(PARAGRAPH_SPLIT)) {
    const trimmed = p.trim()
    if (!trimmed) continue
    for (const s of tokenizer.tokenize(trimmed)) {
      const clean = s.trim()
      if (clean.length > 0) out.push(clean)
    }
  }
  return out
}
