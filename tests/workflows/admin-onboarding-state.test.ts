// [Admin] Get Onboarding State v1.0.0 — GET caiac/admin/onboarding-state
// CAIAC staff only. Thin wrapper around [Onboarding] Get Client State v1.0.0.
// Response: { slug, exists, client_id, client_name, steps: [{key,label,status}], features: {} }

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/onboarding-state'
let staffToken: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }
})

describe('[Admin] Get Onboarding State v1.0.0 — GET caiac/admin/onboarding-state', () => {
  it('returns 401 without an auth token', async () => {
    const res = await http.get(PATH, { slug: TEST_CLIENT_SLUG }, { skipAuth: true })
    expect(res.status).toBe(401)
  })

  it('returns 400 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, {}, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect(res.status).toBe(400)
  })

  it('returns exists:false with all steps not_run for an unknown slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      slug: string
      exists: boolean
      steps: Array<{ key: string; label: string; status: string }>
      features: Record<string, boolean>
    }>(
      PATH,
      { slug: `no-such-client-${Date.now()}` },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.exists).toBe(false)
    expect(res.body.client_id).toBeNull()
    expect(res.body.steps.every((s) => s.status === 'not_run')).toBe(true)
    expect(res.body.features).toEqual({})
  })

  it('returns exists:true with step statuses for a known slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      slug: string
      exists: boolean
      client_id: string
      client_name: string
      steps: Array<{ key: string; label: string; status: string }>
      features: Record<string, boolean>
    }>(
      PATH,
      { slug: TEST_CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.slug).toBe(TEST_CLIENT_SLUG)
    expect(res.body.exists).toBe(true)
    expect(typeof res.body.client_id).toBe('string')
    expect(Array.isArray(res.body.steps)).toBe(true)
    for (const step of res.body.steps) {
      expect(step).toHaveProperty('key')
      expect(step).toHaveProperty('label')
      expect(['done', 'not_run']).toContain(step.status)
    }
    expect(typeof res.body.features).toBe('object')
  })
})
