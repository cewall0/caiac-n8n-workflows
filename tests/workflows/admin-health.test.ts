import { describe, it, expect, beforeAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

let token: string

beforeAll(async () => {
  token = await getToken()
})

describe('[Admin] Client Health Check — GET caiac/admin/health', () => {
  it('returns 200 with health data for a valid slug', async () => {
    const res = await http.get<{ slug?: string; healthy?: boolean }>(
      'caiac/admin/health',
      { slug: TEST_CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('slug')
    expect(res.body.slug).toBe(TEST_CLIENT_SLUG)
  })

  it('returns 401 without auth token', async () => {
    const res = await http.get('caiac/admin/health', { slug: TEST_CLIENT_SLUG })
    expect(res.status).toBe(401)
  })
})
