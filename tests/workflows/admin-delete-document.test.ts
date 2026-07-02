// [Admin] Delete Document v1.0.0 — DELETE caiac/admin/document
// CAIAC staff only. Soft-deletes a caiac.documents row + hard-deletes Qdrant points.
//
// Rejection paths only — no happy-path delete of a real document in this suite
// (would require seeding + ingesting a document first, out of scope here).

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/document'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Delete Document v1.0.0 — DELETE caiac/admin/document', () => {
  it('rejects requests without an auth token', async () => {
    const res = await http.delete(
      PATH,
      { client_id: TEST_CLIENT_SLUG, filename: 'does-not-exist.txt' },
      { skipAuth: true }
    )
    expect(res.status).not.toBe(200)
  })

  it('returns 404 for a filename that does not exist', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.delete<{ deleted: boolean }>(
      PATH,
      { client_id: TEST_CLIENT_SLUG, filename: `no-such-file-${Date.now()}.txt` },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(404)
    expect(res.body.deleted).toBe(false)
  })

  it('returns 404 for an unknown client slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.delete<{ deleted: boolean }>(
      PATH,
      { client_id: 'does-not-exist-xyz', filename: 'anything.txt' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(404)
    expect(res.body.deleted).toBe(false)
  })
})
