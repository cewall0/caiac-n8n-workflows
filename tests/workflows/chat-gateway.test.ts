import { describe, it, expect } from 'vitest'
import { http } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

// Public gateway — no JWT required, rate-limited by client slug
describe('[Chat] Public Gateway v1.0.0 — POST public/chat', () => {
  it('returns 200 and a response for a valid message', async () => {
    const res = await http.post<{ response?: string }>(
      'public/chat',
      { client_slug: TEST_CLIENT_SLUG, message: 'What services do you offer?', session_id: 'test-session' }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('response')
    expect(typeof res.body.response).toBe('string')
    expect((res.body.response?.length ?? 0)).toBeGreaterThan(0)
  })

  it('returns 400 when message is missing', async () => {
    const res = await http.post('public/chat', { client_slug: TEST_CLIENT_SLUG })
    expect(res.status).toBe(400)
  })

  it('returns 400 when client_slug is missing', async () => {
    const res = await http.post('public/chat', { message: 'Hello' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for unknown client slug', async () => {
    const res = await http.post('public/chat', {
      client_slug: 'does-not-exist-xyz',
      message: 'Hello',
      session_id: 'test-session',
    })
    expect(res.status).toBe(403)
  })
})
