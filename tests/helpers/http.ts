import { createHmac } from 'crypto'
import { db } from './db'

const BASE_URL = process.env.N8N_WEBHOOK_BASE ?? 'https://flows-staging.caiacdigital.com'
const WEBHOOK_KEY = process.env.WEBHOOK_HEADER_KEY ?? ''

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  ok: boolean
}

// [Utility] Full Auth v2.0.0's "Verify HMAC" node requires x-caiac-timestamp +
// x-caiac-signature on every Bearer-authenticated request (same on staging and
// prod — confirmed identical logic in both). Real callers (Cloudflare Functions)
// always sign via functions/api/_shared/sign.ts; this suite never did, which is
// why every admin/staff-guarded test was silently failing auth. Signing here,
// centrally, means no individual test file needs to change.
const webhookSecretCache = new Map<string, string | null>()

function decodeJwtClientId(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return typeof payload.client_id === 'string' ? payload.client_id : null
  } catch {
    return null
  }
}

async function getWebhookSecretForToken(token: string): Promise<string | null> {
  const clientId = decodeJwtClientId(token)
  if (!clientId) return null
  if (webhookSecretCache.has(clientId)) return webhookSecretCache.get(clientId) ?? null
  try {
    const row = await db.queryOne<{ webhook_secret: string | null }>(
      `SELECT webhook_secret FROM caiac.clients WHERE id = $1 AND active = true LIMIT 1`,
      [clientId]
    )
    const secret = row?.webhook_secret ?? null
    webhookSecretCache.set(clientId, secret)
    return secret
  } catch {
    webhookSecretCache.set(clientId, null)
    return null
  }
}

// Mirrors caiac-ops-dashboard/functions/api/_shared/sign.ts exactly:
// signature = HMAC-SHA256(`${timestamp}.${token}`, webhook_secret), hex-encoded.
function signRequest(token: string, secret: string): { timestamp: string; signature: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac('sha256', secret).update(`${timestamp}.${token}`).digest('hex')
  return { timestamp, signature }
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

  const authValue = headers['Authorization'] ?? headers['authorization']
  if (authValue?.startsWith('Bearer ') && !headers['x-caiac-signature']) {
    const token = authValue.slice(7)
    const secret = await getWebhookSecretForToken(token)
    if (secret) {
      const signed = signRequest(token, secret)
      headers['x-caiac-timestamp'] = signed.timestamp
      headers['x-caiac-signature'] = signed.signature
    }
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
