import type { MiddlewareHandler } from 'hono'

export const DISCLAIMER =
  'melo-rx is for informational purposes only. It does not constitute medical advice ' +
  'and must not replace clinical judgment. Always consult a licensed healthcare professional.'

/**
 * Injects disclaimer into any JSON response that does not already contain one.
 * Non-suppressible by callers — wire this onto all /v1/interactions* routes.
 */
export const disclaimerMiddleware: MiddlewareHandler = async (c, next) => {
  await next()

  const contentType = c.res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return

  const status = c.res.status
  const text = await c.res.text()

  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    const newHeaders = new Headers(c.res.headers)
    c.res = new Response(text, { status, headers: newHeaders })
    return
  }

  if (!('disclaimer' in body)) {
    body['disclaimer'] = DISCLAIMER
  }

  const newHeaders = new Headers(c.res.headers)
  newHeaders.set('content-type', 'application/json; charset=UTF-8')
  c.res = new Response(JSON.stringify(body), {
    status,
    headers: newHeaders,
  })
}

/**
 * Wraps an interaction result with disclaimer + meta.
 * Use this in every interaction route handler; the middleware is a safety net.
 */
export function withDisclaimer<T extends Record<string, unknown>, M extends Record<string, unknown>>(
  data: T,
  extraMeta: M = {} as M,
) {
  return {
    data,
    disclaimer: DISCLAIMER,
    meta: {
      version: '0.1.0',
      dataset_version: new Date().toISOString().slice(0, 10),
      ...extraMeta,
    } as { version: string; dataset_version: string } & M,
  }
}
