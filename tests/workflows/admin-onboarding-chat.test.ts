// [Admin] Onboarding Chat v1.0.0 — POST caiac/admin/onboarding-chat
// CAIAC staff only. Webhook-triggered AI agent for provisioning new clients.
// Body: { message, session_id } → Response: { response, session_id }
//
// Each request is stateless (no cross-request memory) — the happy-path test
// below sends a generic opening message. It never provides enough detail for
// the agent to call a provisioning tool, so it's safe against prod data.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'

const PATH = 'caiac/admin/onboarding-chat'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Onboarding Chat v1.0.0 — POST caiac/admin/onboarding-chat', () => {
  it('returns 401 without an auth token', async () => {
    const res = await http.post(
      PATH,
      { message: 'Hello', session_id: 'test-suite' },
      { skipAuth: true }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when message is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { session_id: 'test-suite' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(400)
  })

  it('echoes session_id and returns an agent response for a generic opening message', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const sessionId = `test-suite-${Date.now()}`
    const res = await http.post<{ response: string; session_id: string }>(
      PATH,
      { message: "Hi — what do you need from me to onboard a new client?", session_id: sessionId },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.session_id).toBe(sessionId)
    expect(typeof res.body.response).toBe('string')
    expect(res.body.response.length).toBeGreaterThan(0)
  }, 30_000)
})
