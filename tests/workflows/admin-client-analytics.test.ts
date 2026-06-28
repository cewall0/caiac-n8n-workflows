// [Admin] Get Client Analytics v1.0.0 — GET admin/client-analytics
// CAIAC staff only. Returns lead funnel, AI trend, review funnel, ROI score.
// Auth: Authorization: Bearer header.
//
// NOTE: Exact funnel value assertions require the analytics seed fixture
// (tests/fixtures/analytics.ts — Phase T8 in the plan). Current tests
// verify shape and types only until the fixture is built.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'admin/client-analytics'
let staffToken: string | null = null

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) console.warn('CAIAC_STAFF_EMAIL not configured — staff-required tests will skip')
})

describe('[Admin] Get Client Analytics v1.0.0 — GET admin/client-analytics', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.get(PATH, { slug: TEST_CLIENT_SLUG }, { skipAuth: true })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 400 when slug is missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, {}, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect([400, 500]).toContain(res.status)
  })

  it('returns 404 for unknown client slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(
      PATH,
      { slug: 'nonexistent-client-xyz', months: '3' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(404)
  })

  it('clamps invalid months to 3 (default)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ months: number }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, months: '99' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.months).toBe(3)
  })

  it('returns 200 with expected top-level shape', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      slug: string
      months: number
      roi_score: number
      lead_funnel: {
        total: number
        qualified: number
        crm_synced: number
        review_sent: number
        review_responded: number
        review_positive: number
      }
      ai_trend: unknown[]
      review_funnel: unknown[]
      features: Record<string, boolean>
    }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, months: '3' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.slug).toBe(TEST_CLIENT_SLUG)
    expect(res.body.months).toBe(3)

    // ROI score: 0–100 inclusive
    expect(typeof res.body.roi_score).toBe('number')
    expect(res.body.roi_score).toBeGreaterThanOrEqual(0)
    expect(res.body.roi_score).toBeLessThanOrEqual(100)

    // Lead funnel fields
    const f = res.body.lead_funnel
    expect(typeof f.total).toBe('number')
    expect(typeof f.qualified).toBe('number')
    expect(typeof f.crm_synced).toBe('number')
    expect(typeof f.review_sent).toBe('number')
    expect(typeof f.review_responded).toBe('number')
    expect(typeof f.review_positive).toBe('number')

    // Funnel monotonicity: each step ≤ previous
    expect(f.qualified).toBeLessThanOrEqual(f.total)
    expect(f.review_responded).toBeLessThanOrEqual(f.review_sent)
    expect(f.review_positive).toBeLessThanOrEqual(f.review_responded)

    // Arrays
    expect(Array.isArray(res.body.ai_trend)).toBe(true)
    expect(Array.isArray(res.body.review_funnel)).toBe(true)

    // Features map
    expect(typeof res.body.features).toBe('object')
  })

  it('ai_trend entries have expected fields', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ ai_trend: Array<{ period: string; request_count: number; cap: number }> }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, months: '6' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    for (const entry of res.body.ai_trend) {
      expect(entry).toHaveProperty('period')
      expect(entry).toHaveProperty('request_count')
      expect(entry).toHaveProperty('cap')
      expect(entry.period).toMatch(/^\d{4}-\d{2}$/)
      expect(entry.request_count).toBeGreaterThanOrEqual(0)
      expect(entry.cap).toBeGreaterThan(0)
    }
  })

  it('review_funnel entries have expected fields', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ review_funnel: Array<{ month: string; sent: number; responded: number; positive: number }> }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, months: '3' },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    for (const entry of res.body.review_funnel) {
      expect(entry).toHaveProperty('month')
      expect(entry).toHaveProperty('sent')
      expect(entry).toHaveProperty('responded')
      expect(entry).toHaveProperty('positive')
      expect(entry.month).toMatch(/^\d{4}-\d{2}$/)
      expect(entry.responded).toBeLessThanOrEqual(entry.sent)
      expect(entry.positive).toBeLessThanOrEqual(entry.responded)
    }
  })
})
