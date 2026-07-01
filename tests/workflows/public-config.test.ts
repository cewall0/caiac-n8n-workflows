import { describe, it, expect } from 'vitest'
import { http } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

describe('[Client] Public Config v1.0.0 — GET caiac/public/client-config', () => {
  it('returns 200 and config shape for a valid slug', async () => {
    const res = await http.get<{ slug?: string; features?: Record<string, boolean> }>(
      'caiac/public/client-config',
      { slug: TEST_CLIENT_SLUG }
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('slug')
    expect(res.body.slug).toBe(TEST_CLIENT_SLUG)
  })

  it('returns features object', async () => {
    const res = await http.get<{ features?: Record<string, boolean> }>(
      'caiac/public/client-config',
      { slug: TEST_CLIENT_SLUG }
    )
    expect(res.body).toHaveProperty('features')
    expect(typeof res.body.features).toBe('object')
  })

  it('returns 400 for missing slug', async () => {
    const res = await http.get('caiac/public/client-config')
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown slug', async () => {
    const res = await http.get('caiac/public/client-config', { slug: 'does-not-exist-xyz' })
    expect(res.status).toBe(404)
  })
})
