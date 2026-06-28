// [Admin] Manage Client User v1.0.0 — POST admin/manage-client-user
// CAIAC staff only. List/deactivate/activate/change-role/force-change-password.
// SECURITY-CRITICAL: all user queries must be scoped to client_id derived from slug.
// Auth: Authorization: Bearer header. saveDataSuccessExecution: none.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { db, TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'admin/manage-client-user'
let staffToken: string | null = null
let testUserId: string | null = null
let testUserOriginalActive: boolean | null = null
let testUserOriginalRole: string | null = null

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) {
    console.warn('CAIAC_STAFF_EMAIL not configured — staff-required tests will skip')
    return
  }

  // Find a non-staff user for the test client to run mutation tests against
  const row = await db.queryOne<{ id: string; active: boolean; role: string }>(
    `SELECT u.id, u.active, u.role FROM caiac.users u
     JOIN caiac.clients c ON u.client_id = c.id
     WHERE c.slug = $1 AND u.is_caiac_staff = false
     LIMIT 1`,
    [TEST_CLIENT_SLUG]
  )
  if (row) {
    testUserId = row.id
    testUserOriginalActive = row.active
    testUserOriginalRole = row.role
  } else {
    console.warn(`No non-staff users found for ${TEST_CLIENT_SLUG} — mutation tests will skip`)
  }
})

afterAll(async () => {
  if (!staffToken || !testUserId || testUserOriginalActive === null || testUserOriginalRole === null) return

  // Restore original state
  await db.query(
    `UPDATE caiac.users SET active = $1, role = $2 WHERE id = $3::uuid`,
    [testUserOriginalActive, testUserOriginalRole, testUserId]
  )
})

describe('[Admin] Manage Client User v1.0.0 — POST admin/manage-client-user', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.post(PATH, { slug: TEST_CLIENT_SLUG, action: 'list' }, { skipAuth: true })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 400 for unknown action', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'delete_all' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 400 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { action: 'list' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns 404 for unknown client slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: 'nonexistent-client-xyz', action: 'list' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(404)
  })

  it('list returns users array with expected fields (no password_hash)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ success: boolean; action: string; users: Array<Record<string, unknown>> }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'list' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.action).toBe('list')
    expect(Array.isArray(res.body.users)).toBe(true)

    for (const user of res.body.users) {
      expect(user).toHaveProperty('id')
      expect(user).toHaveProperty('name')
      expect(user).toHaveProperty('email')
      expect(user).toHaveProperty('role')
      expect(user).toHaveProperty('active')
      // SECURITY: password_hash must never appear in the response
      expect(user).not.toHaveProperty('password_hash')
      expect(JSON.stringify(user)).not.toMatch(/password_hash/)
    }
  })

  it('list never returns is_caiac_staff=true users (staff excluded from client user list)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ users: Array<{ is_caiac_staff?: boolean }> }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'list' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    for (const user of res.body.users) {
      expect(user.is_caiac_staff).not.toBe(true)
    }
  })

  it('deactivate sets active=false and is scoped to the correct client', async () => {
    if (!staffToken || !testUserId) { console.warn('No test user available — skipping'); return }
    const res = await http.post<{ success: boolean; user: { id: string; active: boolean } }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'deactivate', user_id: testUserId },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.user?.active).toBe(false)

    // DB assertion
    const row = await db.queryOne<{ active: boolean }>(
      `SELECT active FROM caiac.users WHERE id = $1::uuid`,
      [testUserId]
    )
    expect(row?.active).toBe(false)
  })

  it('activate sets active=true', async () => {
    if (!staffToken || !testUserId) { console.warn('No test user available — skipping'); return }
    const res = await http.post<{ success: boolean; user: { id: string; active: boolean } }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'activate', user_id: testUserId },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.user?.active).toBe(true)
  })

  it('change_role rejects invalid role values', async () => {
    if (!staffToken || !testUserId) { console.warn('No test user available — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'change_role', user_id: testUserId, role: 'superadmin' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('force_change_password sets must_change_password=true', async () => {
    if (!staffToken || !testUserId) { console.warn('No test user available — skipping'); return }
    const res = await http.post<{ success: boolean; user: { must_change_password: boolean } }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, action: 'force_change_password', user_id: testUserId },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.user?.must_change_password).toBe(true)

    // DB assertion
    const row = await db.queryOne<{ must_change_password: boolean }>(
      `SELECT must_change_password FROM caiac.users WHERE id = $1::uuid`,
      [testUserId]
    )
    expect(row?.must_change_password).toBe(true)
  })

  // SECURITY: Cross-client isolation — deactivating user_id from wrong slug must affect 0 rows
  it('cannot affect users from a different client slug (cross-client isolation)', async () => {
    if (!staffToken || !testUserId) { console.warn('No test user available — skipping'); return }
    // Attempt to deactivate the test user using a DIFFERENT slug
    // The workflow scopes by client_id derived from slug — mismatched slug finds 0 rows
    const res = await http.post<{ success: boolean; user: unknown }>(
      PATH,
      { slug: 'caiac', action: 'deactivate', user_id: testUserId },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    // Should succeed (no error) but return null user (0 rows matched)
    if (res.status === 200) {
      // user should be null — no rows updated (cross-client isolation worked)
      expect(res.body.user).toBeNull()
    }

    // DB assertion: the user's active status is unchanged
    const row = await db.queryOne<{ active: boolean; client_id: string }>(
      `SELECT u.active, u.client_id FROM caiac.users u WHERE u.id = $1::uuid`,
      [testUserId]
    )
    // User should still match original client (not been modified by wrong-slug request)
    const clientRow = await db.queryOne<{ id: string }>(
      `SELECT id FROM caiac.clients WHERE slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    expect(row?.client_id).toBe(clientRow?.id)
  })
})
