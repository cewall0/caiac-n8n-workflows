import { describe, it, expect } from 'vitest'
import { http } from '../helpers/http'
import { validCredentials, badCredentials } from '../fixtures/auth'

describe('Auth Flow', () => {
  describe('POST caiac/auth/signin', () => {
    it('returns 200 and a JWT token for valid credentials', async () => {
      const res = await http.post<{ token?: string; refresh_token?: string }>(
        'caiac/auth/signin',
        validCredentials,
        { skipAuth: true } as never
      )
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('token')
      expect(typeof res.body.token).toBe('string')
    })

    it('returns 401 for invalid credentials', async () => {
      const res = await http.post(
        'caiac/auth/signin',
        badCredentials,
        { skipAuth: true } as never
      )
      expect(res.status).toBe(401)
    })
  })

  describe('Token refresh + signout', () => {
    it('full flow: signin → refresh → signout', async () => {
      const signinRes = await http.post<{ token: string; refresh_token: string }>(
        'caiac/auth/signin',
        validCredentials,
        { skipAuth: true } as never
      )
      expect(signinRes.status).toBe(200)
      const { token, refresh_token } = signinRes.body

      const refreshRes = await http.post<{ token: string }>(
        'caiac/auth/refresh',
        { refresh_token, client_slug: validCredentials.client_slug },
        { skipAuth: true } as never
      )
      expect(refreshRes.status).toBe(200)
      expect(refreshRes.body).toHaveProperty('token')

      const signoutRes = await http.post(
        'caiac/auth/signout',
        { refresh_token, client_slug: validCredentials.client_slug },
        { skipAuth: true } as never
      )
      expect(signoutRes.status).toBe(200)
    })

    it('refresh fails after signout', async () => {
      const signinRes = await http.post<{ token: string; refresh_token: string }>(
        'caiac/auth/signin',
        validCredentials,
        { skipAuth: true } as never
      )
      const { refresh_token } = signinRes.body

      await http.post(
        'caiac/auth/signout',
        { refresh_token, client_slug: validCredentials.client_slug },
        { skipAuth: true } as never
      )

      const refreshRes = await http.post(
        'caiac/auth/refresh',
        { refresh_token, client_slug: validCredentials.client_slug },
        { skipAuth: true } as never
      )
      expect(refreshRes.status).toBe(401)
    })
  })
})
