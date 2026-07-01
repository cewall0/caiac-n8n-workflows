// [Intake] CAIAC Lead Capture v2.1.0
// Accepts Tally webhook format. Auth via ?slug=&key= query params.
// Stores all fields in intake_data JSONB — no flat email/phone/source columns.

import { describe, it, expect, afterEach } from 'vitest'
import { http } from '../helpers/http'
import { db, dbAvailable, TEST_CLIENT_SLUG } from '../helpers/db'
import { validLead, leadEmailOnly, leadPhoneOnly, leadNoContact, invalidPayload, INTAKE_QUERY_PARAMS } from '../fixtures/lead-capture'

afterEach(async () => {
  if (!dbAvailable) return
  await db.query(
    `DELETE FROM caiac.leads
     WHERE client_id = (SELECT id FROM caiac.clients WHERE slug = $1)
       AND intake_data->>'source' = 'test-suite'`,
    [TEST_CLIENT_SLUG]
  ).catch(() => { /* best-effort cleanup */ })
})

describe('[Intake] CAIAC Lead Capture v2.1.0', () => {
  it('accepts a valid lead with email + phone and returns 200', async () => {
    const res = await http.post('intake/lead', validLead, { params: INTAKE_QUERY_PARAMS })
    expect(res.status).toBe(200)
  })

  it('inserts a row into caiac.leads with correct intake_data', async () => {
    if (!dbAvailable) { console.warn('DATABASE_URL not reachable — skipping DB assertion'); return }
    await http.post('intake/lead', validLead, { params: INTAKE_QUERY_PARAMS })
    const row = await db.queryOne<{ intake_data: Record<string, string> }>(
      `SELECT intake_data FROM caiac.leads
       WHERE client_id = (SELECT id FROM caiac.clients WHERE slug = $1)
         AND intake_data->>'source' = 'test-suite'
       ORDER BY created_at DESC LIMIT 1`,
      [TEST_CLIENT_SLUG]
    )
    expect(row).not.toBeNull()
    expect(row?.intake_data?.email).toBe('test-suite+lead@example.invalid')
  })

  it('accepts a lead with email only (no phone)', async () => {
    const res = await http.post('intake/lead', leadEmailOnly, { params: INTAKE_QUERY_PARAMS })
    expect(res.status).toBe(200)
  })

  it('accepts a lead with phone only (no email)', async () => {
    const res = await http.post('intake/lead', leadPhoneOnly, { params: INTAKE_QUERY_PARAMS })
    expect(res.status).toBe(200)
  })

  it('accepts a lead with no contact info (no email or phone rejection at form level)', async () => {
    const res = await http.post('intake/lead', leadNoContact, { params: INTAKE_QUERY_PARAMS })
    expect(res.status).toBe(200)
  })

  it('rejects non-Tally payload format with 400', async () => {
    const res = await http.post('intake/lead', invalidPayload, { params: INTAKE_QUERY_PARAMS })
    expect(res.status).toBe(400)
  })

  it('returns lead_id and status in the response body', async () => {
    const res = await http.post<{ status?: string; lead_id?: string }>('intake/lead', validLead, { params: INTAKE_QUERY_PARAMS })
    expect(res.body).toHaveProperty('status', 'created')
    expect(res.body).toHaveProperty('lead_id')
    expect(typeof res.body.lead_id).toBe('string')
  })
})
