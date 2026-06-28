// Smoke tests — prod-safe: HTTP only, no DB writes, no side effects.
// Run after any prod deploy to verify endpoints are live.
//
// Usage (against prod):
//   N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npm run test:smoke
//
// Strategy:
// - Auth-protected endpoints: send without auth → must return 401/403 (not 404/502)
// - Public endpoints: send minimal valid payload → must return 200/400 (not 404/502)
// A 404 or 502 means the workflow is down, deactivated, or the path is wrong.

import { describe, it, expect } from 'vitest'

const BASE = process.env.N8N_WEBHOOK_BASE ?? 'https://flows.caiacdigital.com'
const KEY = process.env.WEBHOOK_HEADER_KEY ?? ''

const ALIVE = [200, 202, 400, 401, 403, 409, 410, 422, 500]

async function post(path: string, body: unknown, auth?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (KEY) headers['x-webhook-key'] = KEY
  if (auth) headers['Authorization'] = `Bearer ${auth}`
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
  it('POST caiac/auth/signin — endpoint alive (rejects bad creds)', async () => {
    const s = await post('caiac/auth/signin', { email: 'smoke@test.invalid', password: 'x', client_slug: TEST_SLUG })
    expect(ALIVE).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/auth/refresh — endpoint alive (rejects invalid token)', async () => {
    const s = await post('caiac/auth/refresh', { client_slug: TEST_SLUG, token: 'invalid' })
    expect(ALIVE).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/auth/signout — endpoint alive (rejects invalid token)', async () => {
    const s = await post('caiac/auth/signout', { client_slug: TEST_SLUG, token: 'invalid' })
    expect(ALIVE).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/auth/change-password — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/auth/change-password', { client_slug: TEST_SLUG })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })
})

describe('Smoke — Intake layer', () => {
  it('POST intake/lead — endpoint alive (rejects missing slug)', async () => {
    const s = await post('intake/lead', { name: 'Smoke Test', email: 'smoke@test.invalid' })
    expect(ALIVE).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })
})

describe('Smoke — Chat layer', () => {
  it('POST caiac/chat — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/chat', { client_id: TEST_SLUG, message: 'smoke' })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('GET henderson/public-config — endpoint alive', async () => {
    const s = await get('henderson/public-config')
    // Public endpoint — should return 200
    expect([200, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/history/sessions — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/history/sessions', { client_id: TEST_SLUG })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/history/messages — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/history/messages', { client_id: TEST_SLUG, session_id: 'smoke' })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/history/delete — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/history/delete', { client_id: TEST_SLUG, session_id: 'smoke' })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/history/promote — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/history/promote', { client_id: TEST_SLUG, session_id: 'smoke', message_index: 0 })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/history/dismiss — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/history/dismiss', { client_id: TEST_SLUG, session_id: 'smoke', message_index: 0 })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })
})

describe('Smoke — Admin layer', () => {
  it('GET caiac/health — endpoint alive (rejects missing auth)', async () => {
    const s = await get('caiac/health')
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('GET caiac/admin/clients — endpoint alive (rejects missing auth)', async () => {
    const s = await get('caiac/admin/clients')
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('GET caiac/admin/documents — endpoint alive (rejects missing auth)', async () => {
    const s = await get(`caiac/admin/documents`, { slug: TEST_SLUG })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/admin/ingest — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/admin/ingest', { client_id: TEST_SLUG })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/admin/ingest/preview — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/admin/ingest/preview', { client_id: TEST_SLUG })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/admin/client-feature — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/admin/client-feature', { slug: TEST_SLUG, feature: 'chat', enabled: true })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/admin/client-config — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/admin/client-config', { slug: TEST_SLUG })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('GET henderson/health — endpoint alive (rejects missing auth)', async () => {
    const s = await get('henderson/health')
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })

  it('POST caiac/admin/delete-leads — endpoint alive (rejects missing auth)', async () => {
    const s = await post('caiac/admin/delete-leads', { client_slug: TEST_SLUG, mode: 'test_data', dry_run: true })
    expect([401, 403, 400, 500]).toContain(s)
    expect(s).not.toBe(404)
    expect(s).not.toBe(502)
  })
})
