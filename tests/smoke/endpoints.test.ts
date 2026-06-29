// Smoke tests — prod-safe: HTTP only, no DB writes, no side effects.
// Run after any prod deploy to verify endpoints are live.
//
// Usage (against prod):
//   N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npm run test:smoke
//
// Strategy:
//   Every test asserts the endpoint responds and is NOT 404/502.
//   Auth behavior (401 enforcement) is the integration tests' job.
//   Without WEBHOOK_HEADER_KEY, auth-protected endpoints return 200+error body;
//   that's fine — the smoke test only cares the endpoint is reachable.
//
// Skipped endpoints (not yet deployed to prod):
//   - henderson/public-config  (pending Chat v2.6.0 prod deploy)
//   - henderson/health         (path unconfirmed on prod — Client Health Check v1.0.0)

import { describe, it, expect } from 'vitest'

const BASE = process.env.N8N_WEBHOOK_BASE ?? 'https://flows.caiacdigital.com'
const KEY = process.env.WEBHOOK_HEADER_KEY ?? ''

// Any response code other than 404/502 means the workflow exists and is reachable.
const ALIVE = [200, 202, 400, 401, 403, 409, 410, 422, 500]

function assertAlive(s: number) {
  expect(ALIVE).toContain(s)
  expect(s).not.toBe(404)
  expect(s).not.toBe(502)
}

async function post(path: string, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (KEY) headers['x-webhook-key'] = KEY
  const res = await fetch(`${BASE}/webhook/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'manual',
  })
  return res.status
}

async function get(path: string, params?: Record<string, string>) {
  const headers: Record<string, string> = {}
  if (KEY) headers['x-webhook-key'] = KEY
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${BASE}/webhook/${path}${qs}`, { headers, redirect: 'manual' })
  return res.status
}

const TEST_SLUG = 'henderson'

describe('Smoke — Auth layer', () => {
  it('POST caiac/auth/signin — endpoint alive', async () => {
    assertAlive(await post('caiac/auth/signin', { email: 'smoke@test.invalid', password: 'x', client_slug: TEST_SLUG }))
  })

  it('POST caiac/auth/refresh — endpoint alive', async () => {
    assertAlive(await post('caiac/auth/refresh', { client_slug: TEST_SLUG, token: 'invalid' }))
  })

  it('POST caiac/auth/signout — endpoint alive', async () => {
    assertAlive(await post('caiac/auth/signout', { client_slug: TEST_SLUG, token: 'invalid' }))
  })

  it('POST caiac/auth/change-password — endpoint alive', async () => {
    assertAlive(await post('caiac/auth/change-password', { client_slug: TEST_SLUG }))
  })
})

describe('Smoke — Intake layer', () => {
  it('POST intake/lead — endpoint alive', async () => {
    assertAlive(await post('intake/lead', { name: 'Smoke Test', email: 'smoke@test.invalid' }))
  })
})

describe('Smoke — Chat layer', () => {
  it('POST caiac/chat — endpoint alive', async () => {
    assertAlive(await post('caiac/chat', { client_id: TEST_SLUG, message: 'smoke' }))
  })

  it('POST caiac/history/sessions — endpoint alive', async () => {
    assertAlive(await post('caiac/history/sessions', { client_id: TEST_SLUG }))
  })

  it('POST caiac/history/messages — endpoint alive', async () => {
    assertAlive(await post('caiac/history/messages', { client_id: TEST_SLUG, session_id: 'smoke' }))
  })

  it('POST caiac/history/delete — endpoint alive', async () => {
    assertAlive(await post('caiac/history/delete', { client_id: TEST_SLUG, session_id: 'smoke' }))
  })

  it('POST caiac/history/promote — endpoint alive', async () => {
    assertAlive(await post('caiac/history/promote', { client_id: TEST_SLUG, session_id: 'smoke', message_index: 0 }))
  })

  it('POST caiac/history/dismiss — endpoint alive', async () => {
    assertAlive(await post('caiac/history/dismiss', { client_id: TEST_SLUG, session_id: 'smoke', message_index: 0 }))
  })
})

describe('Smoke — Admin layer', () => {
  it('GET caiac/health — endpoint alive', async () => {
    assertAlive(await get('caiac/health'))
  })

  it('GET caiac/admin/clients — endpoint alive', async () => {
    assertAlive(await get('caiac/admin/clients'))
  })

  it('GET caiac/admin/documents — endpoint alive', async () => {
    assertAlive(await get('caiac/admin/documents', { slug: TEST_SLUG }))
  })

  it('POST caiac/admin/ingest — endpoint alive', async () => {
    assertAlive(await post('caiac/admin/ingest', { client_id: TEST_SLUG }))
  })

  it('POST caiac/admin/ingest/preview — endpoint alive', async () => {
    assertAlive(await post('caiac/admin/ingest/preview', { client_id: TEST_SLUG }))
  })

  it('POST caiac/admin/client-feature — endpoint alive', async () => {
    assertAlive(await post('caiac/admin/client-feature', { slug: TEST_SLUG, feature: 'chat', enabled: true }))
  })

  it('POST caiac/admin/client-config — endpoint alive', async () => {
    assertAlive(await post('caiac/admin/client-config', { slug: TEST_SLUG }))
  })

  it('POST caiac/admin/delete-leads — endpoint alive', async () => {
    assertAlive(await post('caiac/admin/delete-leads', { client_slug: TEST_SLUG, mode: 'test_data', dry_run: true }))
  })
})

// Skipped: henderson/public-config — pending Chat v2.6.0 prod deploy (path returns 404 until then)
// Skipped: henderson/health — Client Health Check v1.0.0 prod path unconfirmed; add once verified
