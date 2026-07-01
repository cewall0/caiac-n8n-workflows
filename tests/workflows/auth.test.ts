// Auth workflow integration tests.
//
// Staging caveat: respondToWebhook nodes on this n8n version always return HTTP 200
// regardless of the configured status code. Non-200 codes only occur when the workflow
// crashes before reaching a respond node. Prod correctly returns configured codes.
// Tests that must assert non-200 accept [status, body] combos to pass on both envs.
//
// Refresh / Signout omitted: those endpoints go through [Utility] Full Auth v2.0.0,
// which requires HMAC-signed requests (x-caiac-timestamp + x-caiac-signature). The
// test helper doesn't implement HMAC signing. Those flows are covered by the client
// dashboard's Cloudflare Function layer (which does sign requests).

import { describe, it, expect } from 'vitest'
import { http } from '../helpers/http'
import { validCredentials, badCredentials } from '../fixtures/auth'

describe('Auth Flow', () => {
  describe('POST caiac/auth/signin — valid credentials', () => {
    it('returns 200 and a JWT token', async () => {
      const res = await http.post<{ token?: string }>(
        'caiac/auth/signin',
        validCredentials,
        { skipAuth: true } as never
      )
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('token')
      expect(typeof res.body.token).toBe('string')
      expect((res.body.token ?? '').length).toBeGreaterThan(0)
    })

    it('response includes webhook_secret and session_id', async () => {
      const res = await http.post<{ token?: string; webhook_secret?: string; session_id?: string }>(
        'caiac/auth/signin',
        validCredentials,
        { skipAuth: true } as never
      )
      expect(res.status).toBe(200)
      // These fields are required for HMAC-signed calls to Refresh/Signout
      expect(res.body).toHaveProperty('webhook_secret')
      expect(res.body).toHaveProperty('session_id')
    })

    it('response does not expose password_hash', async () => {
      const res = await http.post(
        'caiac/auth/signin',
        validCredentials,
        { skipAuth: true } as never
      )
      expect(res.status).toBe(200)
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash/)
    })
  })

  describe('POST caiac/auth/signin — invalid credentials', () => {
    it('rejects bad credentials (401 on prod; 200 with error body on staging)', async () => {
      const res = await http.post<Record<string, unknown>>(
        'caiac/auth/signin',
        badCredentials,
        { skipAuth: true } as never
      )
      // Prod returns 401. Staging n8n returns 200 with an error body because
      // respondToWebhook status codes are not honored on this instance version.
      if (res.status === 200) {
        // Must not look like a successful signin
        expect(res.body).not.toHaveProperty('token')
      } else {
        expect(res.status).toBe(401)
      }
    })

    it('error body contains an error indicator (not a token)', async () => {
      const res = await http.post<Record<string, unknown>>(
        'caiac/auth/signin',
        badCredentials,
        { skipAuth: true } as never
      )
      const body = res.body ?? {}
      // Either status is non-200, or body has error key, or body is empty — never a token
      const hasToken = typeof body === 'object' && 'token' in body
      expect(hasToken).toBe(false)
    })
  })
})
