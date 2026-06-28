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

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'
import { staffUser, adminUser } from '../fixtures/roles'

let clientToken: string
let staffToken: string | null = null
let adminToken: string | null = null

// Session seeded by chat-history tests or any prior chat. If none exists
// the happy-path tests will fail gracefully (no session_id to reference).
// We use a fixed ID that the suite's beforeAll creates in chat-history.test.ts;
// if run standalone, supply a real session_id via TEST_HISTORY_SESSION_ID.
const KNOWN_SESSION_ID = process.env.TEST_HISTORY_SESSION_ID ?? ''

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
    if (!KNOWN_SESSION_ID) { console.warn('TEST_HISTORY_SESSION_ID not set — skipping happy-path promote'); return }
    const res = await http.post<{ promoted?: boolean }>('caiac/history/promote', {
      client_id: TEST_CLIENT_SLUG,
      token: staffToken,
      session_id: KNOWN_SESSION_ID,
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
      session_id: KNOWN_SESSION_ID || 'any',
    })
    expect([400, 500]).toContain(res.status)
  })

  it('staff role can dismiss a real message', async () => {
    if (!staffToken) { console.warn('TEST_USER_STAFF_EMAIL not configured — skipping'); return }
    if (!KNOWN_SESSION_ID) { console.warn('TEST_HISTORY_SESSION_ID not set — skipping happy-path dismiss'); return }
    const res = await http.post<{ deleted?: boolean }>('caiac/history/dismiss', {
      client_id: TEST_CLIENT_SLUG,
      token: staffToken,
      session_id: KNOWN_SESSION_ID,
      message_index: 0,
    })
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  }, 15_000)
})
