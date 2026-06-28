// [Admin] Ingest Preview v1.0.0 — POST caiac/admin/ingest/preview
// CAIAC staff only. Synchronous chunk extraction (no Ollama, no Qdrant write).
// Returns { chunks: [{index, text}], count } for the given document.
// Auth: Authorization: Bearer header.

import { describe, it, expect, beforeAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { TEST_CLIENT_SLUG } from '../helpers/db'

const PATH = 'caiac/admin/ingest/preview'
let staffToken: string | null = null

const SAMPLE_TXT = [
  '## Section One',
  'This is the first chunk of the preview test document.',
  '',
  '## Section Two',
  'This is the second chunk. It contains different content to verify splitting.',
  '',
  '## Section Three',
  'Third chunk for completeness.',
].join('\n')

const SAMPLE_B64 = Buffer.from(SAMPLE_TXT).toString('base64')

beforeAll(async () => {
  staffToken = await getStaffToken()
  if (!staffToken) console.warn('CAIAC_STAFF_EMAIL not configured — staff-required tests will skip')
})

describe('[Admin] Ingest Preview v1.0.0 — POST caiac/admin/ingest/preview', () => {
  it('returns 401 without auth token', async () => {
    const res = await http.post(PATH, {
      client_id: TEST_CLIENT_SLUG,
      filename: 'preview-test.txt',
      role: 'public',
      file_base64: SAMPLE_B64,
    })
    expect([401, 403]).toContain(res.status)
  })

  it('returns 400/500 when required fields are missing', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(
      PATH,
      { client_id: TEST_CLIENT_SLUG }, // missing filename, role, file_base64
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect([400, 500]).toContain(res.status)
  })

  it('returns chunks array for a valid .txt document', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ chunks?: { index: number; text: string }[]; count?: number }>(
      PATH,
      {
        client_id: TEST_CLIENT_SLUG,
        filename: 'preview-test-suite.txt',
        role: 'public',
        file_base64: SAMPLE_B64,
      },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.chunks)).toBe(true)
    expect(typeof res.body.count).toBe('number')
    expect(res.body.count).toBeGreaterThan(0)
    expect(res.body.chunks!.length).toBe(res.body.count)
  }, 20_000)

  it('chunk objects have index and text fields', async () => {
    if (!staffToken) { console.warn('CAIAC_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post<{ chunks?: { index: number; text: string }[] }>(
      PATH,
      {
        client_id: TEST_CLIENT_SLUG,
        filename: 'preview-test-structure.txt',
        role: 'public',
        file_base64: SAMPLE_B64,
      },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    expect(res.status).toBe(200)
    const firstChunk = res.body.chunks?.[0]
    expect(typeof firstChunk?.index).toBe('number')
    expect(typeof firstChunk?.text).toBe('string')
    expect(firstChunk?.text.length).toBeGreaterThan(0)
  }, 20_000)
})
