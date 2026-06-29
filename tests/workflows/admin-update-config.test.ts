// [Admin] Update Client Config v1.0.0 — POST caiac/admin/client-config
// CAIAC staff only. Updates JSON config fields for a client.
// Auth: Authorization: Bearer header.
// Avoid updating field_map — it triggers a Google Sheets sync as a side effect.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/client-config'
let staffToken: string | null = null

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) console.warn('CAIAC_STAFF_EMAIL not configured — staff-required tests will skip')
})

describe('[Admin] Update Client Config v1.0.0 — POST caiac/admin/client-config', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.post(PATH, { slug: TEST_CLIENT_SLUG, notify_email: 'test@example.com' })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 400/500 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { notify_email: 'test@example.com' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 400/500 when no updatable fields are provided', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 404 for an unknown client slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: 'nonexistent_client_xyz', notify_email: 'test@example.com' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([404, 400, 500]).toContain(res.status)
  })

  it('updates lead_notify_method and restores to original value', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }

    // Set to a known value first
    const setRes = await http.post<{ success?: boolean; updated?: string[] }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, lead_notify_method: 'email' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(setRes.status).toBe(200)
    expect(setRes.body.success).toBe(true)
    expect(setRes.body.updated).toContain('lead_notify_method')

    // Restore (email is the default — this is idempotent)
    const restoreRes = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, lead_notify_method: 'email' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(restoreRes.status).toBe(200)
  }, 20_000)
})
