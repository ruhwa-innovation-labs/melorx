import { and, desc, eq } from 'drizzle-orm'
import { drugInteractionReview, logger } from '@melorx/core'
import type { Severity } from '@melorx/core'
import { requireDb, exitWithError } from '../util.js'

const SEVERITY_VALUES: Severity[] = [
  'contraindicated',
  'serious',
  'moderate',
  'minor',
  'monitor',
]
const STATUSES = ['pending', 'approved', 'rejected'] as const
type Status = (typeof STATUSES)[number]

export interface ReviewListArgs {
  status?: string
  severity?: string
  limit?: string
}

export async function listCommand(args: ReviewListArgs): Promise<void> {
  const db = requireDb()
  const limit = Math.max(1, Math.min(500, Number(args.limit ?? '25')))
  const status = (args.status ?? 'pending') as Status
  const severity = args.severity

  if (!STATUSES.includes(status)) {
    exitWithError(`invalid --status "${status}" (one of: ${STATUSES.join('|')})`)
  }
  if (severity && !SEVERITY_VALUES.includes(severity as Severity)) {
    exitWithError(
      `invalid --severity "${severity}" (one of: ${SEVERITY_VALUES.join('|')})`,
    )
  }

  const where = severity
    ? and(
        eq(drugInteractionReview.status, status),
        eq(drugInteractionReview.severity, severity as Severity),
      )
    : eq(drugInteractionReview.status, status)

  const rows = await db
    .select()
    .from(drugInteractionReview)
    .where(where)
    .orderBy(desc(drugInteractionReview.confidence))
    .limit(limit)

  if (rows.length === 0) {
    console.log(`no ${status} review rows found`)
    return
  }

  console.log(
    `${rows.length} row(s), status=${status}${severity ? ` severity=${severity}` : ''}:`,
  )
  for (const row of rows) {
    console.log(
      `  [${row.id}] conf=${row.confidence} severity=${row.severity} ${row.drug1Rxcui}+${row.drug2Rxcui} pattern=${row.patternId}`,
    )
    const snippet = row.sourceSentence.length > 160
      ? `${row.sourceSentence.slice(0, 160)}…`
      : row.sourceSentence
    console.log(`     sentence: ${snippet}`)
  }
}

export async function approveCommand(id: string): Promise<void> {
  if (!id) exitWithError('usage: review approve <id>')
  const db = requireDb()
  const updated = await db
    .update(drugInteractionReview)
    .set({
      status: 'approved',
      reviewedBy: process.env['USER'] ?? 'cli',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(drugInteractionReview.id, id))
    .returning({ id: drugInteractionReview.id })
  if (updated.length === 0) {
    exitWithError(`no review row with id ${id}`)
  }
  console.log(`approved ${updated[0]!.id} — run 'melorx promote' to materialise`)
}

export async function rejectCommand(id: string, reason: string): Promise<void> {
  if (!id) exitWithError('usage: review reject <id> --reason "<text>"')
  if (!reason) exitWithError('--reason is required for rejections')
  const db = requireDb()
  const updated = await db
    .update(drugInteractionReview)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      reviewedBy: process.env['USER'] ?? 'cli',
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(drugInteractionReview.id, id))
    .returning({ id: drugInteractionReview.id })
  if (updated.length === 0) {
    exitWithError(`no review row with id ${id}`)
  }
  console.log(`rejected ${updated[0]!.id}: ${reason}`)
  logger.info(`review row ${updated[0]!.id} rejected with reason: ${reason}`)
}
