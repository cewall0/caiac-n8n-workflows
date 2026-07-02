// [Admin] Rerun Onboarding Step v1.0.0 — POST caiac/admin/rerun-onboarding-step
// CAIAC staff only. Re-runs an idempotent onboarding step for an existing client.
// Allowed steps: seed_features, stub_crm_config, smoke_test
// Body: { slug, step, params? } → Response: { step, result: 'ok', output }
//
// Rejection/validation paths only. All three allowed steps write to prod
// (feature seeding, CRM config, smoke test record) even though idempotent —
// no happy-path invocation in this suite to avoid touching real client state.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/rerun-onboarding-step'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Rerun Onboarding Step v1.0.0 — POST caiac/admin/rerun-onboarding-step', () => {
  it('returns 401 without an auth token', async () => {
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, step: 'seed_features' },
      { skipAuth: true }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { step: 'seed_features' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for a step not in the allowed list', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    // create_client / create_user are intentionally blocked — only idempotent
    // steps may be rerun.
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, step: 'create_client' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for setup_sheet — not yet in the allowed list', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, step: 'setup_sheet' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown client slug with an otherwise-valid step', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { slug: `no-such-client-${Date.now()}`, step: 'smoke_test' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(404)
  })
})
