import { describe, it, expect, beforeAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

// Chat v2.6.0 staging path — protected, requires JWT
const CHAT_PATH = 'caiac/chat/v26-staging'

let token: string

beforeAll(async () => {
  token = await getToken()
})

describe('CAIAC RAG - Chat v2.6.0 — POST caiac/chat/v26-staging', () => {
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
