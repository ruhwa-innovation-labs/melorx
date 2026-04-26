import { logger } from '@melorx/core'
import {
  extractLabelsFromZip,
  parseDownloadIndex,
  verifyChecksum,
  type PartitionDescriptor,
} from './download.js'
import type { OpenFdaLabelJson } from './parse-label.js'

export const OPENFDA_DOWNLOAD_INDEX_URL = 'https://api.fda.gov/download.json'

export interface FetchOptions {
  /** Custom fetch implementation; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch
  /** Per-request timeout in ms. Defaults to 60_000. */
  timeoutMs?: number
}

interface InternalFetchOptions {
  fetchImpl: typeof fetch
  timeoutMs: number
}

function normaliseOptions(opts?: FetchOptions): InternalFetchOptions {
  return {
    fetchImpl: opts?.fetchImpl ?? globalThis.fetch,
    timeoutMs: opts?.timeoutMs ?? 60_000,
  }
}

async function fetchWithTimeout(
  url: string,
  cfg: InternalFetchOptions,
): Promise<Response> {
  const controller = new AbortController()
  const handle = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const res = await cfg.fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    return res
  } finally {
    clearTimeout(handle)
  }
}

export async function fetchDownloadIndex(
  opts?: FetchOptions,
): Promise<PartitionDescriptor[]> {
  const cfg = normaliseOptions(opts)
  const res = await fetchWithTimeout(OPENFDA_DOWNLOAD_INDEX_URL, cfg)
  if (!res.ok) {
    throw new Error(
      `OpenFDA download.json returned ${res.status} ${res.statusText}`,
    )
  }
  const json = (await res.json()) as unknown
  const partitions = parseDownloadIndex(json)
  logger.info(`OpenFDA index: ${partitions.length} drug label partition(s) listed`)
  return partitions
}

export interface DownloadedPartition {
  descriptor: PartitionDescriptor
  labels: OpenFdaLabelJson[]
  /** The actual SHA-256 of the downloaded ZIP, regardless of whether upstream published one. */
  actualChecksum: string
}

export async function downloadAndVerifyPartition(
  descriptor: PartitionDescriptor,
  opts?: FetchOptions,
): Promise<DownloadedPartition> {
  const cfg = normaliseOptions(opts)
  const controller = new AbortController()
  const handle = setTimeout(() => controller.abort(), cfg.timeoutMs)
  let res: Response
  try {
    res = await cfg.fetchImpl(descriptor.fileUrl, { signal: controller.signal })
  } finally {
    clearTimeout(handle)
  }

  if (!res.ok) {
    throw new Error(
      `partition ${descriptor.partitionId} download failed: ${res.status} ${res.statusText}`,
    )
  }

  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const check = verifyChecksum(buffer, descriptor.checksum)
  if (!check.ok) {
    if (check.expected === null) {
      logger.warn(
        `partition ${descriptor.partitionId}: upstream did not publish a checksum — proceeding (actual sha256=${check.actual})`,
      )
    } else {
      throw new Error(
        `partition ${descriptor.partitionId} checksum mismatch: expected=${check.expected} actual=${check.actual}`,
      )
    }
  }

  const labels = extractLabelsFromZip(buffer)
  return { descriptor, labels, actualChecksum: check.actual }
}
