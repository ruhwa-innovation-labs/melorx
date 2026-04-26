import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import type { OpenFdaLabelJson } from './parse-label.js'

/**
 * Shape of a single partition descriptor in OpenFDA's download.json index.
 * Only the fields we consume are declared; unknown fields are tolerated.
 */
export interface PartitionDescriptor {
  /** Basename (e.g. "drug-label-0001-of-0050.json.zip") used as the stable partition id. */
  partitionId: string
  /** Fully-qualified download URL. */
  fileUrl: string
  /** Expected SHA-256 checksum of the ZIP file (hex, no prefix). `null` if upstream omits it. */
  checksum: string | null
  /** Approximate size in MB (informational only). */
  sizeMb: number | null
  /** Number of records inside the partition (informational only). */
  records: number | null
  /** Display name from the index (e.g. "drug label 0001 of 0050"). */
  displayName: string
}

interface RawPartition {
  display_name?: string
  file?: string
  size_mb?: number
  records?: number
  checksum?: string
}

interface RawDownloadIndex {
  results?: {
    drug?: {
      label?: {
        partitions?: RawPartition[]
        export_date?: string
        total_records?: number
      }
    }
  }
}

/** Stripped filename → stable partition id. */
function partitionIdFromUrl(url: string): string {
  const lastSlash = url.lastIndexOf('/')
  return lastSlash >= 0 ? url.slice(lastSlash + 1) : url
}

/** Strips any `sha256:` / `SHA-256:` / `sha256=` prefix and lowercases the hex. */
export function normaliseChecksum(raw: string | null | undefined): string | null {
  if (!raw) return null
  const stripped = raw.replace(/^sha-?256[:=]\s*/i, '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) return null
  return stripped.toLowerCase()
}

export function parseDownloadIndex(raw: unknown): PartitionDescriptor[] {
  const index = raw as RawDownloadIndex
  const partitions = index.results?.drug?.label?.partitions
  if (!Array.isArray(partitions)) return []

  const out: PartitionDescriptor[] = []
  for (const p of partitions) {
    if (!p.file) continue
    out.push({
      partitionId: partitionIdFromUrl(p.file),
      fileUrl: p.file,
      checksum: normaliseChecksum(p.checksum ?? null),
      sizeMb: typeof p.size_mb === 'number' ? p.size_mb : null,
      records: typeof p.records === 'number' ? p.records : null,
      displayName: p.display_name ?? partitionIdFromUrl(p.file),
    })
  }
  return out
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export function verifyChecksum(
  buffer: Buffer,
  expected: string | null,
): { ok: boolean; actual: string; expected: string | null } {
  const actual = sha256Hex(buffer)
  if (expected === null) return { ok: false, actual, expected: null }
  return { ok: actual === expected, actual, expected }
}

/**
 * Extracts all label records from a partition ZIP buffer.
 *
 * OpenFDA partitions contain exactly one JSON file at the root whose top-level
 * shape is `{ meta, results: [...] }`. If the upstream format shifts, this
 * function throws rather than silently emitting an empty list.
 */
export function extractLabelsFromZip(buffer: Buffer): OpenFdaLabelJson[] {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries().filter((e) => !e.isDirectory)
  if (entries.length === 0) {
    throw new Error('partition ZIP is empty')
  }
  const jsonEntry = entries.find((e) => e.entryName.endsWith('.json')) ?? entries[0]
  if (!jsonEntry) throw new Error('partition ZIP contains no JSON file')
  const raw = jsonEntry.getData().toString('utf-8')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `partition JSON parse failed for ${jsonEntry.entryName}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const results = (parsed as { results?: OpenFdaLabelJson[] }).results
  if (!Array.isArray(results)) {
    throw new Error(
      `partition JSON for ${jsonEntry.entryName} missing "results" array`,
    )
  }
  return results
}
