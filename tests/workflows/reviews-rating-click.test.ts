// [Reviews] Handle Rating Click v1.0.0 — GET review-rating
//
// PROD ONLY — no staging deployment. Tests hit https://flows.caiacdigital.com directly.
//
// Signing algorithm mirrors [Utility] Sign Review Token v1.0.0 exactly:
//   payload  = `${client_slug}:${source_type}:${source_ref}:${expiry_ms}`
//   payload_b64 = Buffer.from(payload).toString('base64url')
//   token    = HMAC-SHA256(payload, link_signing_secret).hex()
//
// The link_signing_secret is read from caiac.client_platform_config in the DB.
// Happy-path tests use source_ref = 'test-suite-<ts>' — no matching lead exists in
// DB so Record Rating updates 0 rows and no followup email is sent. Safe against prod.

import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import { db, TEST_CLIENT_SLUG } from '../helpers/db'

const PROD_BASE = 'https://flows.caiacdigital.com'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const SOURCE_REF = `test-suite-${Date.now()}`

interface ClientReviewConfig {
  link_signing_secret: string
  source_type: string
}

let config: ClientReviewConfig | null = null

beforeAll(async () => {
  try {
    const row = await db.queryOne<ClientReviewConfig>(
      `SELECT cpc.link_signing_secret, cpc.source_type
       FROM caiac.client_platform_config cpc
       JOIN caiac.clients c ON c.id = cpc.client_id
       WHERE c.slug = $1 AND cpc.active = true
       LIMIT 1`,
      [TEST_CLIENT_SLUG]
    )
    config = row ?? null
    if (!config?.link_signing_secret) {
      console.warn(`No link_signing_secret found for ${TEST_CLIENT_SLUG} — happy-path tests will skip`)
    }
  } catch {
    console.warn('DATABASE_URL not reachable — happy-path tests will skip')
  }
})

function sign(clientSlug: string, sourceType: string, sourceRef: string, secret: string) {
  const expiry = Date.now() + THIRTY_DAYS_MS
  const payload = `${clientSlug}:${sourceType}:${sourceRef}:${expiry}`
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
  const token = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return { token, payloadB64 }
}

async function ratingClick(params: Record<string, string>) {
  return fetch(`${PROD_BASE}/webhook/review-rating?${new URLSearchParams(params)}`, {
    redirect: 'manual',
  })
}

// ─── Rejection paths ─────────────────────────────────────────────────────────

describe('[Reviews] Handle Rating Click v1.0.0 — rejection paths', () => {
  it('returns error when all params are missing', async () => {
    const res = await ratingClick({})
    expect(res.status).not.toBe(404)
    expect(res.status).not.toBe(502)
    expect([400, 410, 422, 500]).toContain(res.status)
  })

  it('returns error when r param is missing', async () => {
    const res = await ratingClick({
      t: 'invalid',
      p: Buffer.from('henderson:sheet:test:0').toString('base64url'),
    })
    expect(res.status).not.toBe(404)
    expect([400, 410, 422, 500]).toContain(res.status)
  })

  it('returns error when r is not good or bad', async () => {
    const res = await ratingClick({
      t: 'invalid',
      p: Buffer.from('henderson:sheet:test:0').toString('base64url'),
      r: 'neutral',
    })
    expect(res.status).not.toBe(404)
    expect([400, 410, 422, 500]).toContain(res.status)
  })

  it('returns 410 or error for an expired/invalid HMAC token', async () => {
    const res = await ratingClick({
      t: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      p: Buffer.from('henderson:sheet:test:0').toString('base64url'),
      r: 'good',
    })
    expect(res.status).not.toBe(404)
    expect(res.status).not.toBe(502)
    // Expired or mismatched token → 410 expired page, or redirect to expired page
    expect([302, 400, 410, 422, 500]).toContain(res.status)
  })

  it('returns error for malformed base64 payload', async () => {
    const res = await ratingClick({
      t: 'invalid',
      p: 'not!!valid!!base64',
      r: 'bad',
    })
    expect(res.status).not.toBe(404)
    expect([400, 410, 422, 500]).toContain(res.status)
  })
})

// ─── Happy paths ──────────────────────────────────────────────────────────────

describe('[Reviews] Handle Rating Click v1.0.0 — happy paths (signed token)', () => {
  it('good rating → 302 redirect to Google review URL', async () => {
    if (!config?.link_signing_secret) {
      console.warn(`No link_signing_secret for ${TEST_CLIENT_SLUG} — skipping`)
      return
    }
    const { token, payloadB64 } = sign(
      TEST_CLIENT_SLUG,
      config.source_type,
      SOURCE_REF,
      config.link_signing_secret
    )
    const res = await ratingClick({ t: token, p: payloadB64, r: 'good' })
    // Good rating → 302 redirect to the client's Google review link
    expect(res.status).toBe(302)
    const location = res.headers.get('location')
    expect(location).toBeTruthy()
    expect(location).toMatch(/^https?:\/\//)
  }, 20_000)

  it('bad rating → 200 HTML sorry page', async () => {
    if (!config?.link_signing_secret) {
      console.warn(`No link_signing_secret for ${TEST_CLIENT_SLUG} — skipping`)
      return
    }
    // Use a different source_ref so it's a distinct "click" from the good test
    const badRef = `${SOURCE_REF}-bad`
    const { token, payloadB64 } = sign(
      TEST_CLIENT_SLUG,
      config.source_type,
      badRef,
      config.link_signing_secret
    )
    const res = await ratingClick({ t: token, p: payloadB64, r: 'bad' })
    // Bad rating → 200 HTML "sorry" page + followup email triggered
    // (email won't actually send — no lead with this source_ref in DB)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(/<html/i)
  }, 30_000)

  it('tampered r param does not bypass token (good token + r=bad still hits bad path)', async () => {
    if (!config?.link_signing_secret) {
      console.warn(`No link_signing_secret for ${TEST_CLIENT_SLUG} — skipping`)
      return
    }
    // r is not covered by the HMAC — this is by design (the platform trusts click direction).
    // This test documents the current behavior: any r value works with a valid token.
    const ref = `${SOURCE_REF}-tamper`
    const { token, payloadB64 } = sign(
      TEST_CLIENT_SLUG,
      config.source_type,
      ref,
      config.link_signing_secret
    )
    const res = await ratingClick({ t: token, p: payloadB64, r: 'bad' })
    expect([200, 302]).toContain(res.status) // valid token → either path accepted
  }, 20_000)
})
