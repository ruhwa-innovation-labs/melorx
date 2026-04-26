import {
  PATTERNS,
  sentenceMentionsDrugClass,
  type Pattern,
} from './patterns.js'
import { scoreCandidate } from './score.js'
import { inferSeverity } from './severity-map.js'
import { tokenizeSentences } from './tokenize.js'
import type {
  CandidatePair,
  LabelRecord,
  ResolvedDrug,
  ResolverFn,
} from './types.js'

interface PatternHit {
  pattern: Pattern
  sentence: string
  surfaceForm: string
}

interface AggregateKey {
  subjectRxcui: string
  objectRxcui: string
  patternId: string
}

function key(k: AggregateKey): string {
  return `${k.subjectRxcui}::${k.objectRxcui}::${k.patternId}`
}

function patternHitsInSentence(sentence: string): PatternHit[] {
  const hits: PatternHit[] = []
  for (const pattern of PATTERNS) {
    const match = sentence.match(pattern.regex)
    if (!match) continue
    const surfaceForm = match[pattern.objectGroup]
    if (!surfaceForm) continue
    hits.push({ pattern, sentence, surfaceForm: surfaceForm.trim() })
  }
  return hits
}

export interface ExtractResult {
  candidates: CandidatePair[]
  /** Sentences that contained pattern hits but whose object drug failed to resolve. */
  unresolved: Array<{ sentence: string; surfaceForm: string; patternId: string }>
  /** Sentences that matched a drug-class keyword. Logged but not promoted. */
  classReferences: Array<{ sentence: string; surfaceForm: string }>
}

export function extractFromLabel(
  label: LabelRecord,
  resolve: ResolverFn,
): ExtractResult {
  const subjectRxcui = label.subjectRxcuis[0]
  const result: ExtractResult = { candidates: [], unresolved: [], classReferences: [] }
  if (!subjectRxcui) return result

  const subjectResolved: ResolvedDrug = {
    rxcui: subjectRxcui,
    name: label.subjectName,
    quality: 'exact',
  }

  const sentences = tokenizeSentences(label.interactionsText)
  const hitsPerKey = new Map<
    string,
    { hit: PatternHit; object: ResolvedDrug; key: AggregateKey; occurrences: number }
  >()

  for (const sentence of sentences) {
    const classMention = sentenceMentionsDrugClass(sentence)
    if (classMention) {
      result.classReferences.push({ sentence, surfaceForm: classMention })
      // Do NOT emit concrete candidates from class-reference sentences — the
      // object identity is ambiguous between "all class members" and "this
      // specific drug". Per ADR-004, reviewer judgement is required.
      continue
    }

    for (const hit of patternHitsInSentence(sentence)) {
      const resolved = resolve(hit.surfaceForm)
      if (!resolved || resolved.quality === 'unresolved') {
        result.unresolved.push({
          sentence,
          surfaceForm: hit.surfaceForm,
          patternId: hit.pattern.id,
        })
        continue
      }

      if (resolved.rxcui === subjectResolved.rxcui) continue

      const aggregateKey: AggregateKey = {
        subjectRxcui: subjectResolved.rxcui,
        objectRxcui: resolved.rxcui,
        patternId: hit.pattern.id,
      }
      const k = key(aggregateKey)
      const existing = hitsPerKey.get(k)
      if (existing) {
        existing.occurrences += 1
      } else {
        hitsPerKey.set(k, {
          hit,
          object: resolved,
          key: aggregateKey,
          occurrences: 1,
        })
      }
    }
  }

  // Pair-level density: cross-pattern mentions of the same (subject, object)
  // reinforce confidence. Per ADR-004.
  const pairDensity = new Map<string, number>()
  for (const entry of hitsPerKey.values()) {
    const pk = `${entry.key.subjectRxcui}::${entry.key.objectRxcui}`
    pairDensity.set(pk, (pairDensity.get(pk) ?? 0) + entry.occurrences)
  }

  for (const entry of hitsPerKey.values()) {
    const { hit, object, key: aggregateKey } = entry
    const pk = `${aggregateKey.subjectRxcui}::${aggregateKey.objectRxcui}`
    const totalOccurrences = pairDensity.get(pk) ?? 1
    const bothExact =
      subjectResolved.quality === 'exact' && object.quality === 'exact'

    const severity = hit.pattern.severityHint ?? inferSeverity(hit.sentence)

    const confidence = scoreCandidate({
      patternSpecificity: hit.pattern.specificity,
      occurrencesInLabel: totalOccurrences,
      bothExact,
    })

    result.candidates.push({
      subjectRxcui: subjectResolved.rxcui,
      objectRxcui: object.rxcui,
      severity,
      mechanism: hit.sentence,
      management: null,
      sentence: hit.sentence,
      patternId: hit.pattern.id,
      confidence,
      setId: label.set_id,
      effectiveTime: label.effective_time,
      url: label.url,
      labelName: label.subjectName,
      bothExact,
    })
  }

  return result
}
