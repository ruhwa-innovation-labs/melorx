/**
 * Deterministic confidence scoring for extracted interaction pairs.
 *
 * Scoring is a pure function of three signals:
 *   1. Pattern specificity — how narrow the matching regex is
 *   2. Density bonus — how many times the same pair is mentioned in the label
 *   3. Resolution quality — whether both drugs resolved exactly via the resolver
 *
 * Rule #6 threshold is 0.75. Pairs below 0.75 stay in review queue.
 * Additionally: when either drug resolves approximately, confidence is capped
 * at 0.74 regardless of pattern strength — this enforces ADR-004's
 * "two exact-match RxCUI resolutions" requirement.
 */

export interface ScoreInputs {
  /** 0.0..1.0 — intrinsic reliability of the matching pattern. */
  patternSpecificity: number
  /** Number of times the same pair was matched within the same label. >= 1. */
  occurrencesInLabel: number
  /** True when both subject and object drugs resolved exactly. */
  bothExact: boolean
}

const APPROXIMATE_RESOLUTION_CEILING = 0.74
const DENSITY_BONUS_PER_EXTRA = 0.05
const DENSITY_BONUS_CAP = 0.2
const EXACT_RESOLUTION_BONUS = 0.15

export function scoreCandidate(inputs: ScoreInputs): number {
  const { patternSpecificity, occurrencesInLabel, bothExact } = inputs

  if (patternSpecificity < 0 || patternSpecificity > 1) {
    throw new RangeError(`patternSpecificity must be 0..1, got ${patternSpecificity}`)
  }
  if (occurrencesInLabel < 1) {
    throw new RangeError(`occurrencesInLabel must be >= 1, got ${occurrencesInLabel}`)
  }

  const densityBonus = Math.min(
    DENSITY_BONUS_CAP,
    DENSITY_BONUS_PER_EXTRA * (occurrencesInLabel - 1),
  )
  const resolutionBonus = bothExact ? EXACT_RESOLUTION_BONUS : 0

  const rawScore = patternSpecificity + densityBonus + resolutionBonus
  const clipped = Math.min(1, Math.max(0, rawScore))

  if (!bothExact && clipped >= 0.75) {
    return APPROXIMATE_RESOLUTION_CEILING
  }
  return Number(clipped.toFixed(2))
}
