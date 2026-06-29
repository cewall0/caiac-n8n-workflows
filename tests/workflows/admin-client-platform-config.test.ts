// [Admin] Get/Update Client Platform Config v1.0.0
// GET + POST admin/client-platform-config — CAIAC staff only.
// GET: returns client_platform_config row including review_notify_email + facebook_review_link.
// POST: updates editable fields. link_signing_secret is read-only and must never be writable.
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { db, TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'admin/client-platform-config'
let staffToken: string | null = null
let originalGoogleReviewLink: string | null = null

beforeAll(async () => {
  try {
    staffToken = await getStaffToken()
  } catch {
    console.warn('CAIAC_STAFF_EMAIL not configured or credentials invalid — staff-required tests will skip')
  }

  // Capture original google_review_link so we can restore it after the POST test
  try {
    const row = await db.queryOne<{ google_review_link: string | null }>(
      `SELECT google_review_link FROM caiac.client_platform_config WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    originalGoogleReviewLink = row?.google_review_link ?? null
  } catch {
    // DB not configured — DB assertion tests will skip
  }
})

afterAll(async () => {
  // Restore original google_review_link if the POST test changed it
  if (originalGoogleReviewLink !== null) {
    await db.query(
      `UPDATE caiac.client_platform_config SET google_review_link = $1 WHERE client_slug = $2`,
      [originalGoogleReviewLink, TEST_CLIENT_SLUG]
    ).catch(() => {/* ignore — best effort restore */})
  }
})

describe('[Admin] Get/Update Client Platform Config v1.0.0 — GET admin/client-platform-config', () => {
  it('returns 401 without auth token (GET)', async () => {
    const res = await http.get(PATH, { slug: TEST_CLIENT_SLUG }, { skipAuth: true })
    expect([401, 403, 404]).toContain(res.status)
  })

  it('returns 400 or 500 when slug is missing (GET)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, {}, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect([400, 500]).toContain(res.status)
  })

  it('returns 200 with all expected fields for valid slug', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{
      client_slug: string
      client_id: string
      source_type: string | null
      lead_sheet_id: string | null
      lead_sheet_tab: string | null
      google_review_link: string | null
      facebook_review_link: string | null
      review_notify_email: string | null
      link_signing_secret: string
      active: boolean
    }>(PATH, { slug: TEST_CLIENT_SLUG }, { headers: { Authorization: `Bearer ${staffToken}` } })

    expect(res.status).toBe(200)
    expect(res.body.client_slug).toBe(TEST_CLIENT_SLUG)
    expect(res.body).toHaveProperty('google_review_link')
    expect(res.body).toHaveProperty('facebook_review_link')
    // Renamed from client_admin_email in migration 2 — must use new name
    expect(res.body).toHaveProperty('review_notify_email')
    expect(res.body).not.toHaveProperty('client_admin_email')
    expect(res.body).toHaveProperty('link_signing_secret')
    expect(typeof res.body.link_signing_secret).toBe('string')
    expect(res.body.link_signing_secret.length).toBeGreaterThan(0)
    expect(typeof res.body.active).toBe('boolean')
  })

  it('does not expose password_hash or other sensitive fields', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get(PATH, { slug: TEST_CLIENT_SLUG }, { headers: { Authorization: `Bearer ${staffToken}` } })
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/)
  })
})

describe('[Admin] Get/Update Client Platform Config v1.0.0 — POST admin/client-platform-config', () => {
  const testReviewLink = 'https://maps.google.com/?cid=test-review-link-99999'

  it('returns 401 without auth token (POST)', async () => {
    const res = await http.post(PATH, { slug: TEST_CLIENT_SLUG, google_review_link: testReviewLink }, { skipAuth: true })
    expect([401, 403, 404]).toContain(res.status)
  })

  it('updates google_review_link and returns success', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ success: boolean }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, google_review_link: testReviewLink },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('DB reflects the updated google_review_link', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const row = await db.queryOne<{ google_review_link: string }>(
      `SELECT google_review_link FROM caiac.client_platform_config WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    expect(row?.google_review_link).toBe(testReviewLink)
  })

  it('link_signing_secret is not writable via POST', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const attemptedSecret = 'attacker-controlled-secret'
    await http.post(
      PATH,
      { slug: TEST_CLIENT_SLUG, link_signing_secret: attemptedSecret },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    // Verify DB was not changed
    const row = await db.queryOne<{ link_signing_secret: string }>(
      `SELECT link_signing_secret FROM caiac.client_platform_config WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    expect(row?.link_signing_secret).not.toBe(attemptedSecret)
  })

  it('updates facebook_review_link independently', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const testFbLink = 'https://www.facebook.com/test-page-99999/reviews'
    const res = await http.post<{ success: boolean }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, facebook_review_link: testFbLink },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)

    const row = await db.queryOne<{ facebook_review_link: string }>(
      `SELECT facebook_review_link FROM caiac.client_platform_config WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    expect(row?.facebook_review_link).toBe(testFbLink)

    // Restore
    await db.query(
      `UPDATE caiac.client_platform_config SET facebook_review_link = NULL WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
  })

  it('updates review_notify_email (renamed from client_admin_email in migration 2)', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const original = await db.queryOne<{ review_notify_email: string | null }>(
      `SELECT review_notify_email FROM caiac.client_platform_config WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    const testEmail = 'test-reviews@example.com'

    const res = await http.post<{ success: boolean }>(
      PATH,
      { slug: TEST_CLIENT_SLUG, review_notify_email: testEmail },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)

    const row = await db.queryOne<{ review_notify_email: string }>(
      `SELECT review_notify_email FROM caiac.client_platform_config WHERE client_slug = $1`,
      [TEST_CLIENT_SLUG]
    )
    expect(row?.review_notify_email).toBe(testEmail)

    // Restore
    await db.query(
      `UPDATE caiac.client_platform_config SET review_notify_email = $1 WHERE client_slug = $2`,
      [original?.review_notify_email ?? null, TEST_CLIENT_SLUG]
    )
  })
})
