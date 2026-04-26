import AdmZip from 'adm-zip'
import { describe, it, expect, vi } from 'vitest'
import {
  downloadAndVerifyPartition,
  fetchDownloadIndex,
  OPENFDA_DOWNLOAD_INDEX_URL,
} from '../fetch.js'
import { sha256Hex, type PartitionDescriptor } from '../download.js'

function jsonRes(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

function binaryRes(body: Buffer, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/zip' },
  })
}

function mockFetch(impl: (url: string) => Promise<Response>): typeof fetch {
  return vi.fn(impl) as unknown as typeof fetch
}

function buildPartitionZip(labels: unknown[]): Buffer {
  const zip = new AdmZip()
  zip.addFile(
    'drug-label-test.json',
    Buffer.from(JSON.stringify({ meta: {}, results: labels }), 'utf-8'),
  )
  return zip.toBuffer()
}

describe('fetchDownloadIndex', () => {
  it('hits the documented OpenFDA URL and returns parsed partition descriptors', async () => {
    let calledUrl = ''
    const fetchImpl = mockFetch(async (url) => {
      calledUrl = url
      return jsonRes({
        results: {
          drug: {
            label: {
              partitions: [
                { file: 'https://x.test/a.zip', checksum: 'sha256:' + 'a'.repeat(64) },
                { file: 'https://x.test/b.zip' },
              ],
            },
          },
        },
      })
    })
    const partitions = await fetchDownloadIndex({ fetchImpl })
    expect(calledUrl).toBe(OPENFDA_DOWNLOAD_INDEX_URL)
    expect(partitions).toHaveLength(2)
  })

  it('throws when the index endpoint returns non-2xx', async () => {
    const fetchImpl = mockFetch(async () =>
      new Response('rate limited', { status: 429 }),
    )
    await expect(fetchDownloadIndex({ fetchImpl })).rejects.toThrow(/429/)
  })
})

describe('downloadAndVerifyPartition', () => {
  const labels = [
    { set_id: 'aaa', openfda: { rxcui: ['1'] }, drug_interactions: ['x'] },
  ]
  const zip = buildPartitionZip(labels)
  const expectedHash = sha256Hex(zip)

  const descriptor: PartitionDescriptor = {
    partitionId: 'test.zip',
    fileUrl: 'https://x.test/test.zip',
    checksum: expectedHash,
    sizeMb: 1,
    records: 1,
    displayName: 'test',
  }

  it('returns labels + actualChecksum when the checksum matches', async () => {
    const fetchImpl = mockFetch(async () => binaryRes(zip))
    const { labels: got, actualChecksum } = await downloadAndVerifyPartition(descriptor, {
      fetchImpl,
    })
    expect(got).toHaveLength(1)
    expect(actualChecksum).toBe(expectedHash)
  })

  it('throws when a published checksum does not match the download', async () => {
    const fetchImpl = mockFetch(async () => binaryRes(zip))
    const bad: PartitionDescriptor = { ...descriptor, checksum: 'f'.repeat(64) }
    await expect(
      downloadAndVerifyPartition(bad, { fetchImpl }),
    ).rejects.toThrow(/checksum mismatch/)
  })

  it('proceeds with a warning when no checksum is published', async () => {
    const fetchImpl = mockFetch(async () => binaryRes(zip))
    const noChecksum: PartitionDescriptor = { ...descriptor, checksum: null }
    const { labels: got, actualChecksum } = await downloadAndVerifyPartition(noChecksum, {
      fetchImpl,
    })
    expect(got).toHaveLength(1)
    expect(actualChecksum).toBe(expectedHash)
  })

  it('throws when the partition download returns non-2xx', async () => {
    const fetchImpl = mockFetch(async () => new Response('', { status: 500 }))
    await expect(
      downloadAndVerifyPartition(descriptor, { fetchImpl }),
    ).rejects.toThrow(/500/)
  })
})
