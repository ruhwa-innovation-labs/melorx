import {
  DrugNotFoundError,
  MelorxError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from './errors.js'
import type {
  BatchInteractionResponse,
  DrugResponse,
  InteractionPair,
  InteractionResponse,
  MelorxClientOptions,
  RequestOverrides,
} from './types.js'

interface InternalConfig {
  baseUrl: string
  apiKey: string | null
  fetchImpl: typeof fetch
  timeoutMs: number
  maxRetries: number
  retryBaseDelayMs: number
  extraHeaders: Record<string, string>
}

function normaliseConfig(opts: MelorxClientOptions): InternalConfig {
  if (!opts.baseUrl || typeof opts.baseUrl !== 'string') {
    throw new TypeError('MelorxClient requires a non-empty baseUrl')
  }
  return {
    baseUrl: opts.baseUrl.replace(/\/+$/, ''),
    apiKey: opts.apiKey ?? null,
    fetchImpl: opts.fetch ?? globalThis.fetch,
    timeoutMs: opts.timeoutMs ?? 10_000,
    maxRetries: opts.maxRetries ?? 3,
    retryBaseDelayMs: opts.retryBaseDelayMs ?? 200,
    extraHeaders: opts.headers ?? {},
  }
}

interface ErrorEnvelope {
  error?: string
  message?: string
  drug?: string
}

async function parseErrorBody(res: Response): Promise<ErrorEnvelope> {
  try {
    return (await res.json()) as ErrorEnvelope
  } catch {
    return {}
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    if (signal) {
      const abortHandler = (): void => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal.aborted) abortHandler()
      else signal.addEventListener('abort', abortHandler, { once: true })
    }
  })
}

async function requestJson<T>(
  cfg: InternalConfig,
  path: string,
  init: RequestInit,
  overrides: RequestOverrides | undefined,
): Promise<T> {
  const url = `${cfg.baseUrl}${path}`
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...cfg.extraHeaders,
    ...(init.headers as Record<string, string> | undefined),
    ...(overrides?.headers ?? {}),
  }
  if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey

  let attempt = 0
  while (true) {
    const timeoutController = new AbortController()
    const timeoutHandle = setTimeout(() => timeoutController.abort(), cfg.timeoutMs)

    const signals: AbortSignal[] = [timeoutController.signal]
    if (overrides?.signal) signals.push(overrides.signal)
    const combinedSignal = combineAbortSignals(signals)

    let res: Response
    try {
      res = await cfg.fetchImpl(url, { ...init, headers, signal: combinedSignal })
    } catch (err) {
      clearTimeout(timeoutHandle)
      if (overrides?.signal?.aborted) throw err
      if (isAbortError(err) && timeoutController.signal.aborted) {
        throw new TimeoutError(`request to ${path} timed out after ${cfg.timeoutMs}ms`)
      }
      throw new NetworkError(`network error calling ${path}`, err)
    }
    clearTimeout(timeoutHandle)

    if (res.ok) {
      return (await res.json()) as T
    }

    if (res.status >= 500 && attempt < cfg.maxRetries) {
      const delay = cfg.retryBaseDelayMs * 2 ** attempt
      attempt += 1
      await sleep(delay, overrides?.signal)
      continue
    }

    throw await errorFromResponse(res)
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0] as AbortSignal
  const controller = new AbortController()
  const forward = (s: AbortSignal): void => {
    if (s.aborted) controller.abort(s.reason)
    else s.addEventListener('abort', () => controller.abort(s.reason), { once: true })
  }
  for (const s of signals) forward(s)
  return controller.signal
}

async function errorFromResponse(res: Response): Promise<MelorxError> {
  const body = await parseErrorBody(res)
  const msg = body.message ?? body.error ?? `${res.status} ${res.statusText}`

  if (res.status === 404 && body.error === 'DRUG_NOT_FOUND') {
    return new DrugNotFoundError(msg, body.drug ?? null)
  }
  if (res.status === 400) return new ValidationError(msg)
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after')
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : null
    return new RateLimitError(
      msg,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
    )
  }
  if (res.status >= 500) return new ServerError(msg, res.status)
  return new MelorxError(msg, { status: res.status, code: 'HTTP_ERROR' })
}

export interface MelorxClient {
  readonly baseUrl: string
  checkInteraction(
    drug1: string,
    drug2: string,
    overrides?: RequestOverrides,
  ): Promise<InteractionResponse>
  checkInteractionsBatch(
    pairs: InteractionPair[],
    overrides?: RequestOverrides,
  ): Promise<BatchInteractionResponse>
  resolveDrug(query: string, overrides?: RequestOverrides): Promise<DrugResponse>
  getDrug(rxcui: string, overrides?: RequestOverrides): Promise<DrugResponse>
}

export function createClient(opts: MelorxClientOptions): MelorxClient {
  const cfg = normaliseConfig(opts)

  return {
    get baseUrl() {
      return cfg.baseUrl
    },

    async checkInteraction(drug1, drug2, overrides) {
      const qs = new URLSearchParams({ drug1, drug2 }).toString()
      return requestJson<InteractionResponse>(
        cfg,
        `/v1/interactions?${qs}`,
        { method: 'GET' },
        overrides,
      )
    },

    async checkInteractionsBatch(pairs, overrides) {
      if (!Array.isArray(pairs) || pairs.length === 0) {
        throw new ValidationError('pairs must be a non-empty array')
      }
      return requestJson<BatchInteractionResponse>(
        cfg,
        '/v1/interactions/batch',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pairs }),
        },
        overrides,
      )
    },

    async resolveDrug(query, overrides) {
      const qs = new URLSearchParams({ q: query }).toString()
      return requestJson<DrugResponse>(
        cfg,
        `/v1/drugs/resolve?${qs}`,
        { method: 'GET' },
        overrides,
      )
    },

    async getDrug(rxcui, overrides) {
      return requestJson<DrugResponse>(
        cfg,
        `/v1/drugs/${encodeURIComponent(rxcui)}`,
        { method: 'GET' },
        overrides,
      )
    },
  }
}
