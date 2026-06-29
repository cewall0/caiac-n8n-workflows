// CAIAC RAG - Promote v1.0.0  POST caiac/history/promote
// CAIAC RAG - Dismiss v1.0.0  POST caiac/history/dismiss
//
// Both endpoints require role: owner / admin / staff.
// client role → 403. Missing fields → 400/500.
// Auth: token in request body as `token` field.
//
// Happy-path tests (actually promoting/dismissing) require a configured
// staff/admin/owner user AND a real session_id with a known message_index.
// Those tests use TEST_USER_STAFF_EMAIL from .env.test.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'
import { staffUser, adminUser } from '../fixtures/roles'

const CHAT_PATH = process.env.CHAT_PATH ?? 'caiac/chat/v26-staging'
const SEEDED_SESSION_ID = `test-suite-promote-${Date.now()}`

let clientToken: string
let staffToken: string | null = null
let adminToken: string | null = null
let resolvedSessionId = process.env.TEST_HISTORY_SESSION_ID ?? ''
let seededSession = false

async function signIn(user: { email: string; password: string; client_slug: string }) {
  if (!user.email || !user.password) return null
  const res = await http.post<{ token?: string }>('caiac/auth/signin', user)
  if (!res.ok || !res.body.token) return null
  return res.body.token
}

beforeAll(async () => {
  clientToken = await getToken()
  staffToken = await signIn(staffUser)
  adminToken = await signIn(adminUser)

  if (!resolvedSessionId) {
    const res = await http.post(
      CHAT_PATH,
      { message: 'Hello from the promote/dismiss test suite.', session_id: SEEDED_SESSION_ID },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    )
    if (res.ok) {
      resolvedSessionId = SEEDED_SESSION_ID
      seededSession = true
    }
  }
}, 30_000)

afterAll(async () => {
  if (seededSession) {
    await http.post('caiac/history/delete', {
      client_id: TEST_CLIENT_SLUG,
      token: clientToken,
      session_id: resolvedSessionId,
    })
  }
})

// ─── Promote ─────────────────────────────────────────────────────────────────

describe('CAIAC RAG - Promote v1.0.0 — POST caiac/history/promote', () => {
  it('returns 401 without a token', async () => {
    const res = await http.post('caiac/history/promote', {
      client_id: TEST_CLIENT_SLUG,
      token: '',
      session_id: 'any',
      message_index: 0,
    })
    expect([401, 403]).toContain(res.status)
  })

  it('client role is rejected (403) — promote requires staff/admin/owner', async () => {
    const res = await http.post('caiac/history/promote', {
      client_id: TEST_CLIENT_SLUG,
      token: clientToken,
      session_id: 'any',
      message_index: 0,
    })
    expect([401, 403, 500]).toContain(res.status)
  })

  it('returns 400/500 when session_id is missing', async () => {
    const token = staffToken ?? adminToken
    if (!token) { console.warn('No staff/admin token configured — skipping'); return }
    const res = await http.post('caiac/history/promote', {
      client_id: TEST_CLIENT_SLUG,
      token,
      message_index: 0,
    })
    expect([400, 500]).toContain(res.status)
  })

  it('staff role can promote a real message', async () => {
    if (!staffToken) { console.warn('TEST_USER_STAFF_EMAIL not configured — skipping'); return }
    if (!resolvedSessionId) { console.warn('TEST_HISTORY_SESSION_ID not set — skipping happy-path promote'); return }
    const res = await http.post<{ promoted?: boolean }>('caiac/history/promote', {
      client_id: TEST_CLIENT_SLUG,
      token: staffToken,
      session_id: resolvedSessionId,
      message_index: 0,
    })
    expect(res.status).toBe(200)
    expect(res.body.promoted).toBe(true)
  }, 20_000)
})

// ─── Dismiss ─────────────────────────────────────────────────────────────────

describe('CAIAC RAG - Dismiss v1.0.0 — POST caiac/history/dismiss', () => {
  it('returns 401 without a token', async () => {
    const res = await http.post('caiac/history/dismiss', {
      client_id: TEST_CLIENT_SLUG,
      token: '',
      session_id: 'any',
      message_index: 0,
    })
    expect([401, 403]).toContain(res.status)
  })

  it('client role is rejected (403) — dismiss requires staff/admin/owner', async () => {
    const res = await http.post('caiac/history/dismiss', {
      client_id: TEST_CLIENT_SLUG,
      token: clientToken,
      session_id: 'any',
      message_index: 0,
    })
    expect([401, 403, 500]).toContain(res.status)
  })

  it('returns 400/500 when message_index is missing', async () => {
    const token = staffToken ?? adminToken
    if (!token) { console.warn('No staff/admin token configured — skipping'); return }
    const res = await http.post('caiac/history/dismiss', {
      client_id: TEST_CLIENT_SLUG,
      token,
      session_id: resolvedSessionId || 'any',
    })
    expect([400, 500]).toContain(res.status)
  })

  it('staff role can dismiss a real message', async () => {
    if (!staffToken) { console.warn('TEST_USER_STAFF_EMAIL not configured — skipping'); return }
    if (!resolvedSessionId) { console.warn('TEST_HISTORY_SESSION_ID not set — skipping happy-path dismiss'); return }
    const res = await http.post<{ deleted?: boolean }>('caiac/history/dismiss', {
      client_id: TEST_CLIENT_SLUG,
      token: staffToken,
      session_id: resolvedSessionId,
      message_index: 0,
    })
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  }, 15_000)
})
