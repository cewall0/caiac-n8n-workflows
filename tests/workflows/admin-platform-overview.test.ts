// [Admin] Platform Overview v1.0.0 — GET admin/platform-overview
// CAIAC staff only (cross-client data — rejects client JWTs).
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken, getToken } from '../helpers/http'

const PATH = 'admin/platform-overview'
let staffToken: string | null = null
let clientToken: string | null = null

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) console.warn('CAIAC_STAFF_EMAIL not configured — staff-required tests will skip')

  try {
    clientToken = await getToken()
  } catch {
    console.warn('TEST_USER_EMAIL not configured — client-rejection test will skip')
  }
})

describe('[Admin] Platform Overview v1.0.0 — GET admin/platform-overview', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.get(PATH, {}, { skipAuth: true })
    expect([401, 403]).toContain(res.status)
  })

  it('rejects client-level JWT (cross-client data must not leak to clients)', async () => {
    if (!clientToken) { console.warn('TEST_USER_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, {}, { headers: { Authorization: `Bearer ${clientToken}` } })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 200 with all required stat chip fields for staff', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      active_clients: number
      leads_this_month: number
      automations_this_month: number
      clients_near_cap: number
      errors_last_24h: number
    }>(PATH, {}, { headers: { Authorization: `Bearer ${staffToken}` } })

    expect(res.status).toBe(200)
    expect(typeof res.body.active_clients).toBe('number')
    expect(typeof res.body.leads_this_month).toBe('number')
    expect(typeof res.body.automations_this_month).toBe('number')
    expect(typeof res.body.clients_near_cap).toBe('number')
    expect(typeof res.body.errors_last_24h).toBe('number')

    // Sanity bounds — platform has at least 1 active client
    expect(res.body.active_clients).toBeGreaterThanOrEqual(1)
    // All counts must be non-negative
    expect(res.body.leads_this_month).toBeGreaterThanOrEqual(0)
    expect(res.body.automations_this_month).toBeGreaterThanOrEqual(0)
    expect(res.body.clients_near_cap).toBeGreaterThanOrEqual(0)
    expect(res.body.errors_last_24h).toBeGreaterThanOrEqual(0)
  })
})
