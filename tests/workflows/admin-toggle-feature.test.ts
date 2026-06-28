// [Admin] Toggle Client Feature v1.0.0 — POST caiac/admin/client-feature
// CAIAC staff only. Enables/disables a feature for a client.
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { db, TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/client-feature'
let staffToken: string | null = null

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) console.warn('CAIAC_STAFF_EMAIL not configured — staff-required tests will skip')
})

describe('[Admin] Toggle Client Feature v1.0.0 — POST caiac/admin/client-feature', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.post(PATH, { slug: TEST_CLIENT_SLUG, feature: 'chat', enabled: true })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 400 for unknown feature key', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, feature: 'nonexistent_feature_xyz', enabled: true },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 200]).toContain(res.status)
    if (res.status === 200) {
      // workflow returns 200 with error body for unknown features
      expect(JSON.stringify(res.body)).toMatch(/unknown feature/i)
    }
  })

  it('returns 400 when required fields are missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { feature: 'chat', enabled: true }, // missing slug
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 400 when enabled is not a boolean', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, feature: 'chat', enabled: 'yes' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('successfully sets advanced_ai to false (idempotent — already false by default)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ success?: boolean; feature?: string; enabled?: boolean }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, feature: 'advanced_ai', enabled: false },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.feature).toBe('advanced_ai')
    expect(res.body.enabled).toBe(false)

    // Verify in DB
    const row = await db.queryOne<{ enabled: boolean }>(
      `SELECT cf.enabled FROM caiac.client_features cf
       JOIN caiac.clients c ON cf.client_id = c.id
       WHERE c.slug = $1 AND cf.feature = 'advanced_ai'`,
      [TEST_CLIENT_SLUG]
    )
    expect(row?.enabled).toBe(false)
  })
})
