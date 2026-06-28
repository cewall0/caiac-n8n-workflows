import { describe, it, expect, beforeAll } from 'vitest'
import { http, getToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

let token: string

beforeAll(async () => {
  token = await getToken()
})

describe('[Admin] List Client Documents — GET caiac/admin/documents', () => {
  it('returns 200 and a documents array for a valid slug', async () => {
    const res = await http.get<{ documents?: unknown[] }>(
      'caiac/admin/documents',
      { slug: TEST_CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('documents')
    expect(Array.isArray(res.body.documents)).toBe(true)
  })

  it('returns 401 without auth token', async () => {
    const res = await http.get('caiac/admin/documents', { slug: TEST_CLIENT_SLUG })
    expect(res.status).toBe(401)
  })

  it('returns 400 or 404 for missing slug', async () => {
    const res = await http.get(
      'caiac/admin/documents',
      undefined,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect([400, 404]).toContain(res.status)
  })
})
