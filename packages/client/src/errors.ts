export class MelorxError extends Error {
  readonly status: number | null
  readonly code: string

  constructor(message: string, opts: { status?: number | null; code: string; cause?: unknown }) {
    super(message)
    this.name = this.constructor.name
    this.status = opts.status ?? null
    this.code = opts.code
    if (opts.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = opts.cause
    }
  }
}

export class DrugNotFoundError extends MelorxError {
  readonly drug: string | null

  constructor(message: string, drug: string | null) {
    super(message, { status: 404, code: 'DRUG_NOT_FOUND' })
    this.drug = drug
  }
}

export class ValidationError extends MelorxError {
  constructor(message: string) {
    super(message, { status: 400, code: 'VALIDATION_ERROR' })
  }
}

export class RateLimitError extends MelorxError {
  readonly retryAfterSeconds: number | null

  constructor(message: string, retryAfterSeconds: number | null) {
    super(message, { status: 429, code: 'RATE_LIMIT' })
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class ServerError extends MelorxError {
  constructor(message: string, status: number) {
    super(message, { status, code: 'SERVER_ERROR' })
  }
}

export class NetworkError extends MelorxError {
  constructor(message: string, cause: unknown) {
    super(message, { status: null, code: 'NETWORK_ERROR', cause })
  }
}

export class TimeoutError extends MelorxError {
  constructor(message: string) {
    super(message, { status: null, code: 'TIMEOUT' })
  }
}
