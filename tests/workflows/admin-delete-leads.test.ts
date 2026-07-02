// [Admin] Delete Leads v1.0.0 — POST caiac/admin/delete-leads
// CAIAC staff only. Deletes leads by mode (test_data | by_email | by_source).
//
// Every test here uses dry_run: true — this suite never triggers a real
// delete against DB/Sheet data. dry_run:false is left for manual/ops use.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/delete-leads'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Delete Leads v1.0.0 — POST caiac/admin/delete-leads', () => {
  it('rejects requests without an auth token', async () => {
    const res = await http.post(
      PATH,
      { client_slug: TEST_CLIENT_SLUG, mode: 'test_data', dry_run: true },
      { skipAuth: true }
    )
    expect(res.status).not.toBe(200)
  })

  it('rejects an invalid mode', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { client_slug: TEST_CLIENT_SLUG, mode: 'delete_everything', dry_run: true },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('rejects a missing client_slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { mode: 'test_data', dry_run: true },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('rejects mode=by_email without an email field', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { client_slug: TEST_CLIENT_SLUG, mode: 'by_email', dry_run: true },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('rejects mode=by_source without a source field', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { client_slug: TEST_CLIENT_SLUG, mode: 'by_source', dry_run: true },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('dry_run preview for mode=test_data reports a count without deleting anything', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ ok: boolean; action: string; dry_run: boolean; leads_found: number }>(
      PATH,
      { client_slug: TEST_CLIENT_SLUG, mode: 'test_data', dry_run: true },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.dry_run).toBe(true)
    expect(['dry_run', 'no_leads']).toContain(res.body.action)
    expect(typeof res.body.leads_found).toBe('number')
  })
})
