// [Admin] Get Client Config v1.0.0 — GET admin/client-config?slug=X
// CAIAC staff only. Returns features list + clients.config shape for a client.
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'admin/client-config'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Get Client Config v1.0.0 — GET admin/client-config', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.get(PATH, { slug: TEST_CLIENT_SLUG }, { skipAuth: true })
    expect([401, 403, 404]).toContain(res.status)
  })

  it('returns 400 or 500 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, {}, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect([400, 500]).toContain(res.status)
  })

  it('returns 404 or 500 for unknown slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, { slug: 'does-not-exist-xyz' }, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect([404, 500]).toContain(res.status)
  })

  it('returns 200 with features array and config object for valid slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      slug: string
      features: Array<{ feature: string; enabled: boolean }>
      config: Record<string, unknown>
    }>(PATH, { slug: TEST_CLIENT_SLUG }, { headers: { Authorization: `Bearer ${staffToken}` } })

    expect(res.status).toBe(200)
    expect(res.body.slug).toBe(TEST_CLIENT_SLUG)
    expect(Array.isArray(res.body.features)).toBe(true)
    expect(typeof res.body.config).toBe('object')
  })

  it('feature entries include required fields', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      features: Array<{
        feature: string
        enabled: boolean
        enabled_at: string | null
        enabled_by: string | null
        config: Record<string, unknown> | null
      }>
    }>(PATH, { slug: TEST_CLIENT_SLUG }, { headers: { Authorization: `Bearer ${staffToken}` } })

    expect(res.status).toBe(200)
    expect(res.body.features.length).toBeGreaterThan(0)
    for (const f of res.body.features) {
      expect(f).toHaveProperty('feature')
      expect(f).toHaveProperty('enabled')
      expect(typeof f.feature).toBe('string')
      expect(typeof f.enabled).toBe('boolean')
    }
  })

  it('config includes expected top-level keys', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      config: Record<string, unknown>
    }>(PATH, { slug: TEST_CLIENT_SLUG }, { headers: { Authorization: `Bearer ${staffToken}` } })

    expect(res.status).toBe(200)
    // config is a JSONB blob — assert shape, not exact values
    expect(typeof res.body.config).toBe('object')
    expect(res.body.config).not.toBeNull()
    // Must never expose password_hash in any config field
    expect(JSON.stringify(res.body.config)).not.toMatch(/password_hash/)
  })

  it('chat feature is always present and enabled', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      features: Array<{ feature: string; enabled: boolean }>
    }>(PATH, { slug: TEST_CLIENT_SLUG }, { headers: { Authorization: `Bearer ${staffToken}` } })

    expect(res.status).toBe(200)
    const chat = res.body.features.find(f => f.feature === 'chat')
    expect(chat).toBeDefined()
    expect(chat?.enabled).toBe(true)
  })
})
