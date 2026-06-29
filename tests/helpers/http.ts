const BASE_URL = process.env.N8N_WEBHOOK_BASE ?? 'https://flows-staging.caiacdigital.com'
const WEBHOOK_KEY = process.env.WEBHOOK_HEADER_KEY ?? ''

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  ok: boolean
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; params?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  const { skipAuth, params, ...fetchOptions } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (!skipAuth && WEBHOOK_KEY) {
    headers['x-webhook-key'] = WEBHOOK_KEY
  }

  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${BASE_URL}/webhook/${path}${qs}`, {
    ...fetchOptions,
    headers,
  })

  let body: T
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (ct.includes('application/json') && text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text as unknown as T
    }
  } else {
    body = text as unknown as T
  }

  return { status: res.status, body, ok: res.ok }
}

export const http = {
  post: <T = unknown>(path: string, payload: unknown, opts?: RequestInit & { skipAuth?: boolean; params?: Record<string, string> }) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(payload), ...opts }),

  get: <T = unknown>(path: string, params?: Record<string, string>, opts?: RequestInit & { skipAuth?: boolean }) =>
    request<T>(path, { method: 'GET', params, ...opts }),

  delete: <T = unknown>(path: string, payload: unknown, opts?: RequestInit & { skipAuth?: boolean }) =>
    request<T>(path, { method: 'DELETE', body: JSON.stringify(payload), ...opts }),
}

// Signs in with TEST_USER_EMAIL/PASSWORD and returns a cached JWT for the session.
let _cachedToken: string | null = null
export async function getToken(): Promise<string> {
  if (_cachedToken) return _cachedToken
  const res = await http.post<{ token: string }>('caiac/auth/signin', {
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
    slug: process.env.TEST_CLIENT_SLUG ?? 'henderson',
  })
  if (!res.ok || !res.body.token) throw new Error(`getToken: signin failed (${res.status})`)
  _cachedToken = res.body.token
  return _cachedToken
}

export function clearTokenCache() {
  _cachedToken = null
}

// Signs in with CAIAC_STAFF_EMAIL/PASSWORD — needed for ingest/delete endpoints.
// Uses the CAIAC client slug (not henderson) since staff users belong to the platform client.
let _cachedStaffToken: string | null = null
export async function getStaffToken(): Promise<string | null> {
  if (_cachedStaffToken) return _cachedStaffToken
  const email = process.env.CAIAC_STAFF_EMAIL
  const password = process.env.CAIAC_STAFF_PASSWORD
  if (!email || !password) return null
  const res = await http.post<{ token: string }>('caiac/auth/signin', {
    email,
    password,
    slug: 'caiac',
  })
  if (!res.ok || !res.body.token) throw new Error(`getStaffToken: signin failed (${res.status})`)
  _cachedStaffToken = res.body.token
  return _cachedStaffToken
}

export function clearStaffTokenCache() {
  _cachedStaffToken = null
}
