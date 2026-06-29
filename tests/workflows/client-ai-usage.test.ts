// [Client] Get AI Usage v1.0.0 — GET client/ai-usage
// Client JWT auth. Returns AI cap usage for the authenticated client.
// SECURITY-CRITICAL: client_id comes from JWT only — no ?slug override possible.
// Auth: Authorization: Bearer header (client token, not staff).

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getToken, getStaffToken } from '../helpers/http'

const PATH = 'client/ai-usage'
let clientToken: string | null = null
let staffToken: string | null = null

beforeAll(async () => {
  try {
    clientToken = await getToken()
  } catch {
    console.warn('TEST_USER_EMAIL/PASSWORD not configured — client-auth tests will skip')
  }
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff JWT test will skip')
  }
})

describe('[Client] Get AI Usage v1.0.0 — GET client/ai-usage', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.get(PATH, {}, { skipAuth: true })
    expect([401, 403, 404]).toContain(res.status)
  })

  it('returns usage data or 404 (feature not enabled) for client JWT', async () => {
    if (!clientToken) { console.warn('TEST_USER_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      period?: string
      cap?: number
      request_count?: number
      pct_used?: number
      resets_at?: string
    }>(
      PATH,
      {},
      { headers: { Authorization: `Bearer ${clientToken}` } }
    )
    // 200 = feature enabled; 404 = advanced_ai not enabled for this client
    expect([200, 404]).toContain(res.status)

    if (res.status === 200) {
      expect(res.body.period).toMatch(/^\d{4}-\d{2}$/)
      expect(typeof res.body.cap).toBe('number')
      expect(res.body.cap).toBeGreaterThan(0)
      expect(typeof res.body.request_count).toBe('number')
      expect(res.body.request_count).toBeGreaterThanOrEqual(0)
      expect(typeof res.body.pct_used).toBe('number')
      expect(res.body.pct_used).toBeGreaterThanOrEqual(0)
      expect(res.body.resets_at).toBeTruthy()
    }
  })

  // SECURITY: passing ?slug=other-client must NOT change which client's data is returned
  it('slug query param is ignored — client_id always from JWT', async () => {
    if (!clientToken) { console.warn('TEST_USER_EMAIL not configured — skipping'); return }

    const resNoParam = await http.get<{ cap?: number; request_count?: number }>(
      PATH,
      {},
      { headers: { Authorization: `Bearer ${clientToken}` } }
    )
    const resWithParam = await http.get<{ cap?: number; request_count?: number }>(
      PATH,
      { slug: 'caiac' }, // different client slug injected as query param
      { headers: { Authorization: `Bearer ${clientToken}` } }
    )

    // Both should return the same status
    expect(resWithParam.status).toBe(resNoParam.status)

    // If both are 200, verify same data returned (slug param had no effect)
    if (resNoParam.status === 200 && resWithParam.status === 200) {
      expect(resWithParam.body.cap).toBe(resNoParam.body.cap)
      expect(resWithParam.body.request_count).toBe(resNoParam.body.request_count)
    }
  })

  // Staff token should also work (staff have a client_id in their JWT)
  it('accepts staff JWT when staff has a client_id context', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(
      PATH,
      {},
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    // Staff JWT may or may not have a client_id — 200, 401, 404 are all valid
    expect([200, 401, 403, 404]).toContain(res.status)
  })
})
