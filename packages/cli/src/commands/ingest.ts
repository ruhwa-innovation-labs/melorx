import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { logger } from '@melorx/core'
import {
  createResolverFn,
  downloadAndVerifyPartition,
  fetchDownloadIndex,
  ingestOpenFdaPartition,
  loadPartitionStates,
  savePartitionState,
  type OpenFdaPartitionJson,
} from '@melorx/pipeline'
import { exitWithError, requireDb } from '../util.js'

export async function ingestPartitionCommand(path: string): Promise<void> {
  if (!path) exitWithError('usage: ingest partition <path-to-openfda-partition.json>')

  const absolute = resolve(process.cwd(), path)
  const raw = readFileSync(absolute, 'utf-8')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    exitWithError(`failed to parse JSON from ${absolute}: ${err instanceof Error ? err.message : String(err)}`)
  }

  const partition = parsed as OpenFdaPartitionJson
  if (!Array.isArray(partition.results)) {
    exitWithError(`expected { results: [...] } shape in ${absolute}`)
  }

  const db = requireDb()
  const resolver = await createResolverFn(db)
  const counters = await ingestOpenFdaPartition(db, partition, resolver)
  logger.info({ counters }, 'OpenFDA partition ingestion complete')
  console.log(
    `ingest partition: labels=${counters.labels} candidates=${counters.candidates} inserted=${counters.inserted} deduped=${counters.deduped} class_refs=${counters.classReferences} unresolved=${counters.unresolved}`,
  )
}

export interface IngestAllArgs {
  'max-partitions'?: string
  force?: boolean
  'dry-run'?: boolean
}

interface RunCounters {
  partitionsListed: number
  partitionsDownloaded: number
  partitionsSkippedUnchanged: number
  partitionsFailed: number
  labelsProcessed: number
  candidatesExtracted: number
  reviewRowsInserted: number
  reviewRowsDeduped: number
}

export async function ingestAllCommand(args: IngestAllArgs): Promise<void> {
  const maxPartitions = args['max-partitions']
    ? Number(args['max-partitions'])
    : Infinity
  const force = Boolean(args.force)
  const dryRun = Boolean(args['dry-run'])

  const db = requireDb()
  const resolver = await createResolverFn(db)
  const previousState = await loadPartitionStates(db)

  const partitions = await fetchDownloadIndex()
  const counters: RunCounters = {
    partitionsListed: partitions.length,
    partitionsDownloaded: 0,
    partitionsSkippedUnchanged: 0,
    partitionsFailed: 0,
    labelsProcessed: 0,
    candidatesExtracted: 0,
    reviewRowsInserted: 0,
    reviewRowsDeduped: 0,
  }

  let processed = 0
  for (const descriptor of partitions) {
    if (processed >= maxPartitions) break

    const previous = previousState.get(descriptor.partitionId)
    if (
      !force &&
      previous &&
      descriptor.checksum &&
      previous.checksum === descriptor.checksum
    ) {
      counters.partitionsSkippedUnchanged++
      continue
    }

    if (dryRun) {
      logger.info(
        `[dry-run] would download ${descriptor.partitionId} (${descriptor.sizeMb ?? '?'} MB)`,
      )
      processed++
      continue
    }

    try {
      const { labels, actualChecksum } = await downloadAndVerifyPartition(descriptor)
      counters.partitionsDownloaded++
      counters.labelsProcessed += labels.length

      const result = await ingestOpenFdaPartition(
        db,
        { results: labels },
        resolver,
      )
      counters.candidatesExtracted += result.candidates
      counters.reviewRowsInserted += result.inserted
      counters.reviewRowsDeduped += result.deduped

      await savePartitionState(
        db,
        descriptor.partitionId,
        actualChecksum,
        labels.length,
      )
    } catch (err) {
      counters.partitionsFailed++
      logger.error(
        { err },
        `partition ${descriptor.partitionId} failed — continuing with remaining partitions`,
      )
    }

    processed++
  }

  logger.info({ counters }, 'OpenFDA ingestion run complete')
  console.log(
    `ingest all: listed=${counters.partitionsListed} downloaded=${counters.partitionsDownloaded} skipped=${counters.partitionsSkippedUnchanged} failed=${counters.partitionsFailed} inserted=${counters.reviewRowsInserted}`,
  )

  if (counters.partitionsFailed > 0) {
    logger.warn(
      `${counters.partitionsFailed} partition(s) failed — inspect logs above`,
    )
    process.exit(2)
  }
}
