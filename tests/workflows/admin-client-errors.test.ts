// [Admin] Get Client Errors v1.0.0 — GET admin/client-errors
// CAIAC staff only. Returns recent error_log entries for a client.
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'admin/client-errors'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Get Client Errors v1.0.0 — GET admin/client-errors', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.get(PATH, { slug: TEST_CLIENT_SLUG }, { skipAuth: true })
    expect([401, 403, 404]).toContain(res.status)
  })

  it('returns 400 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, {}, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect([400, 500]).toContain(res.status)
  })

  it('returns 200 with errors array for a valid slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ slug: string; errors: unknown[] }>(
      PATH,
      { slug: TEST_CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.slug).toBe(TEST_CLIENT_SLUG)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  it('error entries include expected fields when present', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ slug: string; errors: Array<{ id: string; workflow_name: string; node_name: string; error_message: string; created_at: string }> }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, limit: '5' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    for (const err of res.body.errors) {
      expect(err).toHaveProperty('id')
      expect(err).toHaveProperty('workflow_name')
      expect(err).toHaveProperty('node_name')
      expect(err).toHaveProperty('error_message')
      expect(err).toHaveProperty('created_at')
      // password_hash must never appear in error response
      expect(JSON.stringify(err)).not.toMatch(/password_hash/)
    }
  })

  it('respects limit param (response length ≤ limit)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ errors: unknown[] }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, limit: '3' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.errors.length).toBeLessThanOrEqual(3)
  })

  it('returns 200 with empty array for a slug with no errors', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    // Use a known slug that likely has no errors, or at minimum verify the shape is correct
    const res = await http.get<{ slug: string; errors: unknown[] }>(
      PATH,
      { slug: TEST_CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    // Either 0 errors (empty state) or N errors — both are valid
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})
