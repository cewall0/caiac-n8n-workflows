import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { db, TEST_CLIENT_SLUG } from '../helpers/db'

const CHAT_PATH = process.env.CHAT_PATH ?? 'caiac/chat/v26-staging'

let token: string
let clientId: string | null = null
let originalCap: number | null = null
let hadCapKey = false

beforeAll(async () => {
  token = await getToken()

  // Fetch henderson's client_id and original advanced_ai cap for cap enforcement tests
  try {
    const client = await db.queryOne<{ id: string }>(
      `SELECT id FROM caiac.clients WHERE slug = $1 AND active = true`,
      [TEST_CLIENT_SLUG]
    )
    clientId = client?.id ?? null

    if (clientId) {
      const cf = await db.queryOne<{ config: Record<string, unknown> | null }>(
        `SELECT config FROM caiac.client_features WHERE client_id = $1 AND feature = 'advanced_ai'`,
        [clientId]
      )
      hadCapKey = cf?.config != null && 'cap' in (cf.config ?? {})
      originalCap = (cf?.config?.cap as number | undefined) ?? null
    }
  } catch {
    // DATABASE_URL not configured — cap enforcement tests will skip
  }
})

afterAll(async () => {
  if (!clientId) return
  try {
    if (hadCapKey && originalCap !== null) {
      // Restore original cap value
      await db.query(
        `UPDATE caiac.client_features
         SET config = jsonb_set(COALESCE(config, '{}'), '{cap}', $1::text::jsonb)
         WHERE client_id = $2 AND feature = 'advanced_ai'`,
        [originalCap.toString(), clientId]
      )
    } else {
      // Cap key didn't exist before — remove it
      await db.query(
        `UPDATE caiac.client_features SET config = config - 'cap'
         WHERE client_id = $1 AND feature = 'advanced_ai'`,
        [clientId]
      )
    }
  } catch {
    console.warn('chat-v26: afterAll cap restore failed — manual cleanup may be needed')
  }
})

describe(`CAIAC RAG - Chat v2.6.0 — POST ${CHAT_PATH}`, () => {
  it('returns 200 and a response for a valid message', async () => {
    const res = await http.post<{ response?: string; session_id?: string }>(
      CHAT_PATH,
      { message: 'What services do you offer?', session_id: 'test-suite-session' },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('response')
    expect(typeof res.body.response).toBe('string')
  })

  it('returns 401 with no token', async () => {
    const res = await http.post(CHAT_PATH, { message: 'Hello', session_id: 'test-session' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when message is missing', async () => {
    const res = await http.post(
      CHAT_PATH,
      { session_id: 'test-session' },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.status).toBe(400)
  })

  it('response includes session_id', async () => {
    const res = await http.post<{ session_id?: string }>(
      CHAT_PATH,
      { message: 'Tell me about your pricing.', session_id: 'test-suite-session' },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.body).toHaveProperty('session_id')
  })
})

describe('CAIAC RAG - Chat v2.6.0 — cap enforcement', () => {
  it('returns 200 when cap is exceeded (Ollama fallback, not error)', async () => {
    if (!clientId) { console.warn('DATABASE_URL not configured — skipping'); return }

    const period = new Date().toISOString().slice(0, 7) // YYYY-MM

    // Read current request_count for this period
    const usageBefore = await db.queryOne<{ request_count: number }>(
      `SELECT COALESCE(request_count, 0) AS request_count
       FROM caiac.ai_usage WHERE client_id = $1 AND period = $2`,
      [clientId, period]
    )
    const countBefore = usageBefore?.request_count ?? 0

    // Set cap = countBefore so the next request immediately hits the cap (count >= cap)
    await db.query(
      `UPDATE caiac.client_features
       SET config = jsonb_set(COALESCE(config, '{}'), '{cap}', $1::text::jsonb)
       WHERE client_id = $2 AND feature = 'advanced_ai'`,
      [countBefore.toString(), clientId]
    )

    const res = await http.post<{ response: string; session_id?: string }>(
      CHAT_PATH,
      { message: 'What services do you offer?', session_id: 'test-suite-cap' },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    // Workflow must fall back to Ollama and still return 200 — not 429 or 500
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('response')
    expect(typeof res.body.response).toBe('string')

    // Ollama fallback must NOT increment ai_usage.request_count
    const usageAfter = await db.queryOne<{ request_count: number }>(
      `SELECT COALESCE(request_count, 0) AS request_count
       FROM caiac.ai_usage WHERE client_id = $1 AND period = $2`,
      [clientId, period]
    )
    expect(usageAfter?.request_count ?? 0).toBe(countBefore)
  })

  it('increments ai_usage.request_count after a successful Claude call', async () => {
    if (!clientId) { console.warn('DATABASE_URL not configured — skipping'); return }
    const period = new Date().toISOString().slice(0, 7)

    // Set a high cap to ensure Claude routing (cap = current_count + 1000)
    const usageBefore = await db.queryOne<{ request_count: number }>(
      `SELECT COALESCE(request_count, 0) AS request_count
       FROM caiac.ai_usage WHERE client_id = $1 AND period = $2`,
      [clientId, period]
    )
    const countBefore = usageBefore?.request_count ?? 0
    const highCap = countBefore + 1000

    await db.query(
      `UPDATE caiac.client_features
       SET config = jsonb_set(COALESCE(config, '{}'), '{cap}', $1::text::jsonb)
       WHERE client_id = $2 AND feature = 'advanced_ai'`,
      [highCap.toString(), clientId]
    )

    await http.post(
      CHAT_PATH,
      { message: 'Hello, can you help me?', session_id: 'test-suite-cap-count' },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const usageAfter = await db.queryOne<{ request_count: number }>(
      `SELECT COALESCE(request_count, 0) AS request_count
       FROM caiac.ai_usage WHERE client_id = $1 AND period = $2`,
      [clientId, period]
    )
    // request_count must have incremented by exactly 1
    expect(usageAfter?.request_count ?? 0).toBe(countBefore + 1)
  })
})
