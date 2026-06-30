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
