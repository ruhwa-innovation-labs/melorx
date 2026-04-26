import { logger } from '@melorx/core'
import { countUngatedLowConfidenceRows, promoteReviewQueue } from '@melorx/pipeline'
import { exitWithError, requireDb } from '../util.js'

export async function promoteCommand(): Promise<void> {
  const db = requireDb()
  const counters = await promoteReviewQueue(db)
  logger.info({ counters }, 'review queue promotion complete')
  console.log(
    `promote: eligible=${counters.eligible} promoted=${counters.promoted} blocked_missing_concept=${counters.blockedMissingConcept} blocked_existing_pair=${counters.blockedExistingPair}`,
  )

  const ungated = await countUngatedLowConfidenceRows(db)
  if (ungated > 0) {
    logger.error(
      `FAIL: ${ungated} drug_interaction row(s) have confidence < 0.75 — Rule #6 violation`,
    )
    exitWithError(`${ungated} sub-threshold row(s) in drug_interaction`, 2)
  }
}
