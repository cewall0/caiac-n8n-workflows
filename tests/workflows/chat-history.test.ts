// CAIAC RAG - Chat History v1.0.0   POST caiac/history/sessions
// CAIAC RAG - Chat Messages v1.0.0  POST caiac/history/messages
// CAIAC RAG - Chat Delete v1.0.0    POST caiac/history/delete
//
// Auth pattern: token in request BODY as `token` field (not Authorization header).
// Flow: seed a session via chat → list sessions → get messages → delete session.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const SESSION_ID = `test-suite-history-${Date.now()}`
const CHAT_PATH = process.env.CHAT_PATH ?? 'caiac/chat/v26-staging'

let authToken: string
let sessionCreated = false

beforeAll(async () => {
  authToken = await getToken()

  // Seed a real session so history/messages have something to return.
  const res = await http.post(
    CHAT_PATH,
    { message: 'Hello from the test suite.', session_id: SESSION_ID },
    { headers: { Authorization: `Bearer ${authToken}` } }
  )
  if (res.ok) sessionCreated = true
}, 30_000)

afterAll(async () => {
  // Clean up the session if the delete test didn't already do it.
  if (sessionCreated) {
    await http.post('caiac/history/delete', {
      client_id: TEST_CLIENT_SLUG,
      token: authToken,
      session_id: SESSION_ID,
    })
  }
})

// ─── Chat History (sessions list) ───────────────────────────────────────────

describe('CAIAC RAG - Chat History v1.0.0 — POST caiac/history/sessions', () => {
  it('returns 200 and a sessions array for an authenticated user', async () => {
    const res = await http.post<{ sessions?: unknown[] }>('caiac/history/sessions', {
      client_id: TEST_CLIENT_SLUG,
      token: authToken,
    })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('sessions')
    expect(Array.isArray(res.body.sessions)).toBe(true)
  })

  it('returns 401 without a token', async () => {
    const res = await http.post('caiac/history/sessions', {
      client_id: TEST_CLIENT_SLUG,
      token: '',
    })
    expect([401, 403]).toContain(res.status)
  })

  it('seeded test session appears in the sessions list', async () => {
    if (!sessionCreated) return
    const res = await http.post<{ sessions?: Array<{ session_id: string }> }>(
      'caiac/history/sessions',
      { client_id: TEST_CLIENT_SLUG, token: authToken }
    )
    expect(res.status).toBe(200)
    const ids = (res.body.sessions ?? []).map((s) => s.session_id)
    expect(ids).toContain(SESSION_ID)
  })
})

// ─── Chat Messages ───────────────────────────────────────────────────────────

describe('CAIAC RAG - Chat Messages v1.0.0 — POST caiac/history/messages', () => {
  it('returns 200 and a messages array for a valid session', async () => {
    if (!sessionCreated) return
    const res = await http.post<{ session_id?: string; messages?: unknown[] }>(
      'caiac/history/messages',
      { client_id: TEST_CLIENT_SLUG, token: authToken, session_id: SESSION_ID }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('session_id', SESSION_ID)
    expect(Array.isArray(res.body.messages)).toBe(true)
  })

  it('returns empty messages for an unknown session', async () => {
    const res = await http.post<{ messages?: unknown[] }>('caiac/history/messages', {
      client_id: TEST_CLIENT_SLUG,
      token: authToken,
      session_id: 'nonexistent-session-xyz',
    })
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(0)
  })

  it('returns 401 without a token', async () => {
    const res = await http.post('caiac/history/messages', {
      client_id: TEST_CLIENT_SLUG,
      token: '',
      session_id: SESSION_ID,
    })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 400 or error when session_id is missing', async () => {
    const res = await http.post('caiac/history/messages', {
      client_id: TEST_CLIENT_SLUG,
      token: authToken,
    })
    expect([400, 500]).toContain(res.status)
  })
})

// ─── Chat Delete ─────────────────────────────────────────────────────────────

describe('CAIAC RAG - Chat Delete v1.0.0 — POST caiac/history/delete', () => {
  it('returns 401 without a token', async () => {
    const res = await http.post('caiac/history/delete', {
      client_id: TEST_CLIENT_SLUG,
      token: '',
      session_id: SESSION_ID,
    })
    expect([401, 403]).toContain(res.status)
  })

  it('deletes the seeded session and returns { deleted: true }', async () => {
    if (!sessionCreated) return
    const res = await http.post<{ deleted?: boolean; session_id?: string }>(
      'caiac/history/delete',
      { client_id: TEST_CLIENT_SLUG, token: authToken, session_id: SESSION_ID }
    )
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
    expect(res.body.session_id).toBe(SESSION_ID)
    sessionCreated = false // prevent afterAll double-delete
  }, 15_000)

  it('session no longer appears in history after delete', async () => {
    if (sessionCreated) return // delete test didn't run
    const res = await http.post<{ sessions?: Array<{ session_id: string }> }>(
      'caiac/history/sessions',
      { client_id: TEST_CLIENT_SLUG, token: authToken }
    )
    expect(res.status).toBe(200)
    const ids = (res.body.sessions ?? []).map((s) => s.session_id)
    expect(ids).not.toContain(SESSION_ID)
  })
})
