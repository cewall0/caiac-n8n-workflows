import { describe, it, expect, afterEach } from 'vitest'
import { http } from '../helpers/http'
import { db, TEST_CLIENT_SLUG } from '../helpers/db'
import { validLead, leadEmailOnly, leadPhoneOnly, leadNoContact } from '../fixtures/lead-capture'

// Clean up all test rows by source tag — catches phone-only leads (no email to track by)
afterEach(async () => {
  await db.query(`DELETE FROM caiac.leads WHERE source = 'test-suite' AND client_id = (SELECT id FROM caiac.clients WHERE slug = $1)`, [TEST_CLIENT_SLUG])
})

describe('[Intake] CAIAC Lead Capture v2.0.0', () => {
  it('accepts a valid lead with email + phone and returns 200', async () => {
    const res = await http.post('intake/lead', validLead)
    expect(res.status).toBe(200)
  })

  it('inserts a row into caiac.leads after submission', async () => {
    await http.post('intake/lead', validLead)
    const row = await db.queryOne(
      `SELECT email, phone, source FROM caiac.leads WHERE email = $1 AND source = 'test-suite' ORDER BY created_at DESC LIMIT 1`,
      [validLead.email]
    )
    expect(row).not.toBeNull()
    expect(row?.email).toBe(validLead.email)
  })

  it('accepts a lead with email only (no phone)', async () => {
    const res = await http.post('intake/lead', leadEmailOnly)
    expect(res.status).toBe(200)
  })

  it('accepts a lead with phone only (no email)', async () => {
    const res = await http.post('intake/lead', leadPhoneOnly)
    expect(res.status).toBe(200)
  })

  it('rejects a lead with no email and no phone', async () => {
    const res = await http.post('intake/lead', leadNoContact)
    expect(res.status).toBe(400)
  })

  it('returns a score in the response body', async () => {
    const res = await http.post<{ score?: number }>('intake/lead', validLead)
    expect(res.body).toHaveProperty('score')
    expect(typeof res.body.score).toBe('number')
  })
})
