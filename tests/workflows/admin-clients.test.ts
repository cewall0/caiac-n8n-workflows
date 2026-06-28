import { describe, it, expect, beforeAll } from 'vitest'
import { http, getToken } from '../helpers/http'

let token: string

beforeAll(async () => {
  token = await getToken()
})

describe('[Admin] List Clients — GET caiac/admin/clients', () => {
  it('returns 200 and an array of clients', async () => {
    const res = await http.get<{ clients?: unknown[] }>(
      'caiac/admin/clients',
      undefined,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('clients')
    expect(Array.isArray(res.body.clients)).toBe(true)
  })

  it('henderson appears in the client list', async () => {
    const res = await http.get<{ clients?: Array<{ client_slug: string }> }>(
      'caiac/admin/clients',
      undefined,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const slugs = res.body.clients?.map((c) => c.client_slug) ?? []
    expect(slugs).toContain('henderson')
  })

  it('returns 401 without auth token', async () => {
    const res = await http.get('caiac/admin/clients')
    expect(res.status).toBe(401)
  })
})
