import { createHmac } from 'crypto'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Mirrors the signing algorithm in [Utility] Sign Review Token v1.0.0.
 * payload = `${clientSlug}:${sourceType}:${sourceRef}:${expiryMs}`
 * token   = HMAC-SHA256(payload, secret).hex()
 */
export function signReviewLink(
  clientSlug: string,
  sourceType: string,
  sourceRef: string,
  secret: string,
  expiryMs = Date.now() + THIRTY_DAYS_MS,
): { token: string; payloadB64: string; expiry: number } {
  const payload = `${clientSlug}:${sourceType}:${sourceRef}:${expiryMs}`
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
  const token = createHmac('sha256', secret).update(payload).digest('hex')
  return { token, payloadB64, expiry: expiryMs }
}

export function expiredReviewLink(
  clientSlug: string,
  sourceType: string,
  sourceRef: string,
  secret: string,
): { token: string; payloadB64: string; expiry: number } {
  const expiry = Date.now() - 1000 // 1 second in the past
  return signReviewLink(clientSlug, sourceType, sourceRef, secret, expiry)
}

/**
 * Signs a review webhook POST body the same way Handle Rating Click validates it —
 * HMAC-SHA256 over the URLEncoded body with link_signing_secret.
 * Used for direct webhook tests that bypass the email link flow.
 */
export function signReviewPayload(secret: string, payload: Record<string, string>): string {
  const body = new URLSearchParams(payload).toString()
  return createHmac('sha256', secret).update(body).digest('hex')
}

export function buildReviewPayload(overrides: Partial<{
  slug: string
  rating: number
  name: string
  email: string
}>): Record<string, string> {
  return {
    slug: overrides.slug ?? process.env.TEST_REVIEW_CLIENT_SLUG ?? 'henderson',
    rating: String(overrides.rating ?? 5),
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? 'test-review@caiacdigital.com',
  }
}
