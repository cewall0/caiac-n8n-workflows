import { describe, it, expect } from 'vitest'
import { http } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

// Safety: never test the success case here — it would change Henderson's real password.
// Tests cover only rejection paths (wrong current password, missing fields).
describe('CAIAC Auth - Change Password v1.0.0 — POST caiac/auth/change-password', () => {
  it('returns 401 when current password is wrong', async () => {
    const res = await http.post('caiac/auth/change-password', {
      email: process.env.TEST_USER_EMAIL,
      current_password: 'definitely-wrong-password-xyz',
      new_password: 'ShouldNotChange1!',
      client_slug: TEST_CLIENT_SLUG,
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await http.post('caiac/auth/change-password', {
      client_slug: TEST_CLIENT_SLUG,
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when new_password is missing', async () => {
    const res = await http.post('caiac/auth/change-password', {
      email: process.env.TEST_USER_EMAIL,
      current_password: 'anything',
      client_slug: TEST_CLIENT_SLUG,
    })
    expect(res.status).toBe(400)
  })
})
