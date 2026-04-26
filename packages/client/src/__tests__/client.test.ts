import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../client.js'
import {
  DrugNotFoundError,
  MelorxError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from '../errors.js'
import type { InteractionResponse, BatchInteractionResponse, DrugResponse } from '../types.js'

const DISCLAIMER = 'melorx is for informational purposes only. ...'

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
  return vi.fn(impl) as unknown as typeof fetch
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

const IBU_LISINOPRIL: InteractionResponse = {
  data: {
    drug1: { rxcui: '5640', name: 'Ibuprofen', classes: ['NSAID'] },
    drug2: { rxcui: '29046', name: 'Lisinopril', classes: ['ACE inhibitor'] },
    interactions: [
      {
        severity: 'moderate',
        mechanism: 'NSAIDs antagonize...',
        management: 'Monitor blood pressure.',
        sources: [
          {
            name: 'ONCHigh',
            url: 'https://example.test/onc',
            type: 'clinical_guideline',
            accessed_date: '2026-04-15',
          },
        ],
        confidence: null,
      },
    ],
  },
  disclaimer: DISCLAIMER,
  meta: { version: '0.1.0', dataset_version: '2026-04-15', query_time_ms: 4 },
}

describe('createClient — configuration', () => {
  it('throws when baseUrl is empty', () => {
    expect(() => createClient({ baseUrl: '' })).toThrow(TypeError)
  })

  it('strips trailing slashes from baseUrl', () => {
    const client = createClient({ baseUrl: 'https://api.test///' })
    expect(client.baseUrl).toBe('https://api.test')
  })
})

describe('checkInteraction', () => {
  it('calls GET /v1/interactions with query params and returns parsed response', async () => {
    const fetchMock = mockFetch(async (url) => {
      expect(url).toBe('https://api.test/v1/interactions?drug1=ibuprofen&drug2=lisinopril')
      return jsonResponse(IBU_LISINOPRIL)
    })
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    const res = await client.checkInteraction('ibuprofen', 'lisinopril')
    expect(res.data.interactions[0]?.severity).toBe('moderate')
    expect(res.disclaimer).toBe(DISCLAIMER)
  })

  it('throws DrugNotFoundError on 404 with DRUG_NOT_FOUND code', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse(
        { error: 'DRUG_NOT_FOUND', message: 'no match', drug: 'notadrug' },
        { status: 404 },
      ),
    )
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })

    await expect(client.checkInteraction('notadrug', 'aspirin')).rejects.toBeInstanceOf(
      DrugNotFoundError,
    )

    try {
      await client.checkInteraction('notadrug', 'aspirin')
    } catch (err) {
      expect(err).toBeInstanceOf(DrugNotFoundError)
      if (err instanceof DrugNotFoundError) {
        expect(err.drug).toBe('notadrug')
      }
    }
  })

  it('throws ValidationError on 400', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: 'BAD_REQUEST', message: 'drug1 required' }, { status: 400 }),
    )
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    await expect(client.checkInteraction('', '')).rejects.toBeInstanceOf(ValidationError)
  })

  it('sends x-api-key header when apiKey is configured', async () => {
    let capturedHeaders: Record<string, string> = {}
    const fetchMock = mockFetch(async (_url, init) => {
      capturedHeaders = init.headers as Record<string, string>
      return jsonResponse(IBU_LISINOPRIL)
    })
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      apiKey: 'secret-key',
    })
    await client.checkInteraction('a', 'b')
    expect(capturedHeaders['x-api-key']).toBe('secret-key')
  })
})

describe('checkInteractionsBatch', () => {
  it('POSTs to /v1/interactions/batch with pairs[] body', async () => {
    const fetchMock = mockFetch(async (url, init) => {
      expect(url).toBe('https://api.test/v1/interactions/batch')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string) as { pairs: unknown[] }
      expect(body.pairs).toHaveLength(2)
      const res: BatchInteractionResponse = {
        data: [IBU_LISINOPRIL.data],
        errors: [],
        disclaimer: DISCLAIMER,
        meta: {
          version: '0.1.0',
          pairs_requested: 2,
          pairs_resolved: 1,
          pairs_failed: 1,
        },
      }
      return jsonResponse(res)
    })
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    const res = await client.checkInteractionsBatch([
      { drug1: 'a', drug2: 'b' },
      { drug1: 'c', drug2: 'd' },
    ])
    expect(res.data).toHaveLength(1)
    expect(res.meta.pairs_requested).toBe(2)
  })

  it('throws ValidationError when pairs is empty', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({}))
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    await expect(client.checkInteractionsBatch([])).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('resolveDrug / getDrug', () => {
  const drugResponse: DrugResponse = {
    data: {
      id: 'uuid-1',
      rxcui: '5640',
      name: 'Ibuprofen',
      drug_class: ['NSAID'],
      identifiers: { ndc: [], atc: 'M01AE01', drugbank: null, brand_names: ['Advil'] },
    },
    meta: { version: '0.1.0' },
  }

  it('resolveDrug hits /v1/drugs/resolve?q=', async () => {
    const fetchMock = mockFetch(async (url) => {
      expect(url).toBe('https://api.test/v1/drugs/resolve?q=advil')
      return jsonResponse(drugResponse)
    })
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    const res = await client.resolveDrug('advil')
    expect(res.data.rxcui).toBe('5640')
  })

  it('getDrug url-encodes the rxcui path segment', async () => {
    const fetchMock = mockFetch(async (url) => {
      expect(url).toBe('https://api.test/v1/drugs/56%2F40')
      return jsonResponse(drugResponse)
    })
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    await client.getDrug('56/40')
  })
})

describe('retry behavior', () => {
  it('retries 5xx responses with exponential backoff', async () => {
    let calls = 0
    const fetchMock = mockFetch(async () => {
      calls += 1
      if (calls < 3) {
        return new Response('', { status: 503, headers: { 'content-type': 'text/plain' } })
      }
      return jsonResponse(IBU_LISINOPRIL)
    })
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    })
    const res = await client.checkInteraction('a', 'b')
    expect(calls).toBe(3)
    expect(res.data.interactions).toHaveLength(1)
  })

  it('gives up and throws ServerError after maxRetries', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: 'INTERNAL' }, { status: 500 }),
    )
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      maxRetries: 1,
      retryBaseDelayMs: 1,
    })
    await expect(client.checkInteraction('a', 'b')).rejects.toBeInstanceOf(ServerError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry 4xx responses', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: 'DRUG_NOT_FOUND', drug: 'x' }, { status: 404 }),
    )
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      maxRetries: 3,
      retryBaseDelayMs: 1,
    })
    await expect(client.checkInteraction('x', 'y')).rejects.toBeInstanceOf(DrugNotFoundError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('rate limiting', () => {
  it('throws RateLimitError with retry-after header when status is 429', async () => {
    const fetchMock = mockFetch(async () =>
      new Response(JSON.stringify({ error: 'RATE_LIMIT' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '42' },
      }),
    )
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      maxRetries: 0,
    })

    try {
      await client.checkInteraction('a', 'b')
      expect.fail('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      if (err instanceof RateLimitError) {
        expect(err.retryAfterSeconds).toBe(42)
      }
    }
  })
})

describe('network + timeout', () => {
  it('throws NetworkError when fetch rejects', async () => {
    const fetchMock = mockFetch(async () => {
      throw new Error('connection refused')
    })
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      maxRetries: 0,
    })
    await expect(client.checkInteraction('a', 'b')).rejects.toBeInstanceOf(NetworkError)
  })

  it('throws TimeoutError when the request exceeds timeoutMs', async () => {
    const fetchMock = mockFetch((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })
    const client = createClient({
      baseUrl: 'https://api.test',
      fetch: fetchMock,
      timeoutMs: 10,
      maxRetries: 0,
    })
    await expect(client.checkInteraction('a', 'b')).rejects.toBeInstanceOf(TimeoutError)
  })
})

describe('MelorxError hierarchy', () => {
  it('all thrown client errors inherit from MelorxError', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({ error: 'DRUG_NOT_FOUND', drug: 'x' }, { status: 404 }),
    )
    const client = createClient({ baseUrl: 'https://api.test', fetch: fetchMock })
    try {
      await client.checkInteraction('x', 'y')
    } catch (err) {
      expect(err).toBeInstanceOf(MelorxError)
      expect(err).toBeInstanceOf(DrugNotFoundError)
      if (err instanceof DrugNotFoundError) {
        expect(err.status).toBe(404)
        expect(err.code).toBe('DRUG_NOT_FOUND')
      }
    }
  })
})
