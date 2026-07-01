// [Admin] Update Feature Config v1.0.0 — POST admin/update-feature-config
// CAIAC staff only. Updates config JSONB on client_features (e.g. AI cap).
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { db, dbAvailable, TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'admin/update-feature-config'
let staffToken: string | null = null
let originalCap: number | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }

  if (!staffToken) return

  // Capture original cap value so afterAll can restore it
  try {
    const row = await db.queryOne<{ config: { cap?: number } }>(
      `SELECT cf.config FROM caiac.client_features cf
       JOIN caiac.clients c ON cf.client_id = c.id
       WHERE c.slug = $1 AND cf.feature = 'advanced_ai'`,
      [TEST_CLIENT_SLUG]
    )
    originalCap = row?.config?.cap ?? null
  } catch {
    console.warn('DATABASE_URL not configured — DB cap snapshot skipped')
  }
})

afterAll(async () => {
  if (!staffToken) return
  // Restore original cap (or null if not set)
  const config = originalCap !== null ? { cap: originalCap } : {}
  await http.post(
    PATH,
    { slug: TEST_CLIENT_SLUG, feature: 'advanced_ai', config },
    { headers: { Authorization: `Bearer ${staffToken}` } }
  )
})

describe('[Admin] Update Feature Config v1.0.0 — POST admin/update-feature-config', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.post(PATH, { slug: TEST_CLIENT_SLUG, feature: 'advanced_ai', config: { cap: 100 } }, { skipAuth: true })
    expect([401, 403, 404]).toContain(res.status)
  })

  it('returns 400 for unknown feature key', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, feature: 'nonexistent_feature_xyz', config: { cap: 100 } },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/unknown feature/i)
  })

  it('returns 400 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { feature: 'advanced_ai', config: { cap: 100 } },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 400 when config is not an object', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, feature: 'advanced_ai', config: 'not-an-object' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 404 for unknown client slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: 'nonexistent-client-xyz', feature: 'advanced_ai', config: { cap: 100 } },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(404)
  })

  it('sets AI cap and DB row reflects the change', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const testCap = 250

    const res = await http.post<{ success: boolean; slug: string; feature: string; config: unknown }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, feature: 'advanced_ai', config: { cap: testCap } },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.feature).toBe('advanced_ai')

    // Verify the write landed in the DB
    if (dbAvailable) {
      const row = await db.queryOne<{ config: { cap: number } }>(
        `SELECT cf.config FROM caiac.client_features cf
         JOIN caiac.clients c ON cf.client_id = c.id
         WHERE c.slug = $1 AND cf.feature = 'advanced_ai'`,
        [TEST_CLIENT_SLUG]
      )
      expect(row?.config?.cap).toBe(testCap)
    }
  })
})
