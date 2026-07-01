// CAIAC Admin Health v1.0.0 — GET caiac/health
// Ops dashboard endpoint — checks Postgres, Qdrant, Ollama, Reranker, HMAC Verifier.
// Requires is_caiac_staff=true. Different from [Admin] Client Health Check (client dashboard).

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'

let staffToken: string | null = null

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) {
    console.warn('CAIAC_STAFF_EMAIL not configured — auth-required tests will be skipped')
  }
})

describe('CAIAC Admin Health v1.0.0 — GET caiac/health', () => {
  it('returns 401 without a token', async () => {
    const res = await http.get('caiac/health')
    expect([401, 403]).toContain(res.status)
  })

  it('returns 200 with status and services map for CAIAC staff', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.get<{ status?: string; services?: Record<string, { status: string }> }>(
      'caiac/health',
      undefined,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status')
    expect(res.body).toHaveProperty('services')
    expect(typeof res.body.services).toBe('object')
  }, 15_000)

  it('services map includes all expected service keys', async () => {
    if (!staffToken) return
    const res = await http.get<{ services?: Record<string, unknown> }>(
      'caiac/health',
      undefined,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    const services = res.body.services ?? {}
    for (const key of ['postgres', 'qdrant', 'ollama', 'reranker', 'hmac_verifier']) {
      expect(services, `missing service key: ${key}`).toHaveProperty(key)
    }
  }, 15_000)

  it('postgres service is up', async () => {
    if (!staffToken) return
    const res = await http.get<{ services?: Record<string, { status: string }> }>(
      'caiac/health',
      undefined,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.services?.postgres?.status).toBe('up')
  }, 15_000)

  it('qdrant service is up', async () => {
    if (!staffToken) return
    const res = await http.get<{ services?: Record<string, { status: string }> }>(
      'caiac/health',
      undefined,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(res.body.services?.qdrant?.status).toBe('up')
  }, 15_000)
})
