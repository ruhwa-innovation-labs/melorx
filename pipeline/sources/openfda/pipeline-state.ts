import { and, eq } from 'drizzle-orm'
import { pipelineState, type Db } from '@melorx/core'

export const OPENFDA_SOURCE_NAME = 'openfda:drug-label'

export interface PartitionState {
  partitionId: string
  checksum: string
  recordsProcessed: number
  lastIngestedAt: Date
}

export async function loadPartitionStates(
  db: Db,
): Promise<Map<string, PartitionState>> {
  const rows = await db
    .select()
    .from(pipelineState)
    .where(eq(pipelineState.sourceName, OPENFDA_SOURCE_NAME))
  const out = new Map<string, PartitionState>()
  for (const row of rows) {
    out.set(row.partitionId, {
      partitionId: row.partitionId,
      checksum: row.checksum,
      recordsProcessed: row.recordsProcessed,
      lastIngestedAt: row.lastIngestedAt,
    })
  }
  return out
}

export async function savePartitionState(
  db: Db,
  partitionId: string,
  checksum: string,
  recordsProcessed: number,
): Promise<void> {
  const now = new Date()
  const existing = await db
    .select({ id: pipelineState.id })
    .from(pipelineState)
    .where(
      and(
        eq(pipelineState.sourceName, OPENFDA_SOURCE_NAME),
        eq(pipelineState.partitionId, partitionId),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(pipelineState)
      .set({ checksum, recordsProcessed, lastIngestedAt: now })
      .where(eq(pipelineState.id, existing[0]!.id))
  } else {
    await db.insert(pipelineState).values({
      sourceName: OPENFDA_SOURCE_NAME,
      partitionId,
      checksum,
      recordsProcessed,
      lastIngestedAt: now,
    })
  }
}
