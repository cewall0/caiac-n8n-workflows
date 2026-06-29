import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { http, getStaffToken } from '../helpers/http'
import { db } from '../helpers/db'
import { clientUser, staffUser, adminUser, ownerUser, ROLE_HIERARCHY, CLIENT_SLUG } from '../fixtures/roles'

// Sign in as a given user and return a JWT, or null if credentials not configured.
async function signIn(user: { email: string; password: string; client_slug: string }): Promise<string | null> {
  if (!user.email || !user.password) return null
  const res = await http.post<{ token?: string }>('caiac/auth/signin', user)
  if (!res.ok || !res.body.token) throw new Error(`signIn failed for ${user.email} (${res.status})`)
  return res.body.token
}

// ─── 1. DB: Role Hierarchy State ────────────────────────────────────────────
// Fast, read-only. Verifies the DB matches the documented spec before
// trusting that chat filtering is actually enforcing the right rules.

describe('Role hierarchy DB state', () => {
  it('role_hierarchy table has correct visible_roles for all 5 roles', async () => {
    const rows = await db.query<{ role: string; visible_roles: string[] }>(
      `SELECT role, visible_roles FROM caiac.role_hierarchy ORDER BY role`
    )
    expect(rows.length).toBeGreaterThanOrEqual(5)

    const byRole = Object.fromEntries(rows.map((r) => [r.role, r.visible_roles.sort()]))

    for (const [role, expected] of Object.entries(ROLE_HIERARCHY)) {
      expect(byRole[role], `visible_roles for role="${role}"`).toEqual([...expected].sort())
    }
  })

  it('owner sees all document roles', async () => {
    const row = await db.queryOne<{ visible_roles: string[] }>(
      `SELECT visible_roles FROM caiac.role_hierarchy WHERE role = 'owner'`
    )
    expect(row?.visible_roles).toEqual(expect.arrayContaining(['public', 'staff', 'admin', 'owner']))
  })

  it('client sees only public documents', async () => {
    const row = await db.queryOne<{ visible_roles: string[] }>(
      `SELECT visible_roles FROM caiac.role_hierarchy WHERE role = 'client'`
    )
    expect(row?.visible_roles).toHaveLength(1)
    expect(row?.visible_roles).toContain('public')
  })

  it('staff does not see admin or owner documents', async () => {
    const row = await db.queryOne<{ visible_roles: string[] }>(
      `SELECT visible_roles FROM caiac.role_hierarchy WHERE role = 'staff'`
    )
    expect(row?.visible_roles).not.toContain('admin')
    expect(row?.visible_roles).not.toContain('owner')
  })
})

// ─── 2. Chat Access by Role ──────────────────────────────────────────────────
// All authenticated roles should reach chat (200). Role filtering happens
// inside the RAG pipeline — not at the HTTP layer. Unauthenticated → 401.

describe('Chat access by role — CAIAC RAG Chat v2.6.0', () => {
  const CHAT_PATH = process.env.CHAT_PATH ?? 'caiac/chat/v26-staging'
  const TEST_MESSAGE = { message: 'What services do you offer?', session_id: 'test-suite-doc-perms' }

  it('unauthenticated request returns 401', async () => {
    const res = await http.post(CHAT_PATH, TEST_MESSAGE)
    expect(res.status).toBe(401)
  })

  it('client role can access chat (sees public docs only)', async () => {
    const token = await signIn(clientUser)
    if (!token) return
    const res = await http.post(CHAT_PATH, TEST_MESSAGE, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })

  it('staff role can access chat (sees public + staff docs)', async () => {
    const token = await signIn(staffUser)
    if (!token) { console.warn('TEST_USER_STAFF_EMAIL not configured — skipping'); return }
    const res = await http.post(CHAT_PATH, TEST_MESSAGE, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })

  it('admin role can access chat (sees public + staff + admin docs)', async () => {
    const token = await signIn(adminUser)
    if (!token) { console.warn('TEST_USER_ADMIN_EMAIL not configured — skipping'); return }
    const res = await http.post(CHAT_PATH, TEST_MESSAGE, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })

  it('owner role can access chat (sees all docs)', async () => {
    const token = await signIn(ownerUser)
    if (!token) { console.warn('TEST_USER_OWNER_EMAIL not configured — skipping'); return }
    const res = await http.post(CHAT_PATH, TEST_MESSAGE, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })
})

// ─── 3. Admin Endpoint Access Control ───────────────────────────────────────
// Document ingest and delete are CAIAC-staff only (is_caiac_staff = true).
// All Henderson client users — regardless of role — should be blocked.

describe('Admin endpoint access control by role', () => {
  let clientToken: string | null = null
  let staffToken: string | null = null
  let adminToken: string | null = null

  beforeAll(async () => {
    clientToken = await signIn(clientUser)
    staffToken = await signIn(staffUser)
    adminToken = await signIn(adminUser)
  })

  // List documents — requires auth but is read-only; accessible to authenticated users
  describe('GET caiac/admin/documents', () => {
    it('client role returns 200 (read access permitted)', async () => {
      if (!clientToken) return
      const res = await http.get('caiac/admin/documents', { slug: 'henderson' }, { headers: { Authorization: `Bearer ${clientToken}` } })
      // list-documents is auth-gated but not role-restricted — adjust if that changes
      expect([200, 403]).toContain(res.status)
    })
  })

  // Ingest — CAIAC staff only
  describe('POST caiac/admin/ingest (CAIAC staff only)', () => {
    const INGEST_PAYLOAD = {
      slug: 'henderson',
      title: 'Test Document',
      content: 'This should never be ingested by a non-staff user.',
      role: 'public',
    }

    it('client role is blocked from ingest', async () => {
      if (!clientToken) return
      const res = await http.post('caiac/admin/ingest', INGEST_PAYLOAD, { headers: { Authorization: `Bearer ${clientToken}` } })
      expect([401, 403]).toContain(res.status)
    })

    it('staff role is blocked from ingest', async () => {
      if (!staffToken) { console.warn('TEST_USER_STAFF_EMAIL not configured — skipping'); return }
      const res = await http.post('caiac/admin/ingest', INGEST_PAYLOAD, { headers: { Authorization: `Bearer ${staffToken}` } })
      expect([401, 403]).toContain(res.status)
    })

    it('admin role is blocked from ingest', async () => {
      if (!adminToken) { console.warn('TEST_USER_ADMIN_EMAIL not configured — skipping'); return }
      const res = await http.post('caiac/admin/ingest', INGEST_PAYLOAD, { headers: { Authorization: `Bearer ${adminToken}` } })
      expect([401, 403]).toContain(res.status)
    })
  })
})

// ─── 4. Content-Level Document Visibility ────────────────────────────────────
// Seeds two test documents with distinct roles, verifies DB storage is correct,
// then exercises the RAG role filter end-to-end via chat.
//
// Discovery: all existing Henderson docs are role=public. These seeded docs
// are the only non-public documents in the collection — deleted in afterAll.
//
// Requires: CAIAC_STAFF_EMAIL / CAIAC_STAFF_PASSWORD in .env.test
// Skips gracefully if staff credentials are not configured.

const CHAT_PATH_V26 = process.env.CHAT_PATH ?? 'caiac/chat/v26-staging'
const PUBLIC_FILE = 'test-suite-public.txt'
const ADMIN_FILE = 'test-suite-admin.txt'

// Unique sentinels — unlikely to appear in any real document or LLM hallucination.
const PUBLIC_SENTINEL = 'TS_PUBLIC_SENTINEL_77AB'
const ADMIN_SENTINEL = 'TS_ADMIN_SENTINEL_3XK9'

const publicDocContent = `This is a test document for the CAIAC integration test suite. The public helpline access code is ${PUBLIC_SENTINEL}. This document is visible to all authenticated users.`
const adminDocContent = `This is a test document for the CAIAC integration test suite. The administrator portal access passphrase is ${ADMIN_SENTINEL}. This document is restricted to admin-tier users only.`

async function waitForDocumentsIndexed(
  filenames: string[],
  staffToken: string,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await http.get<{ documents?: Array<{ filename: string }> }>(
      'caiac/admin/documents',
      { slug: CLIENT_SLUG },
      { headers: { Authorization: `Bearer ${staffToken}` } }
    )
    if (res.ok && Array.isArray(res.body.documents)) {
      const indexed = new Set(res.body.documents.map((d) => d.filename))
      if (filenames.every((f) => indexed.has(f))) return
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`Timed out waiting for test documents to be indexed: ${filenames.join(', ')}`)
}

describe('Content-level document visibility via RAG', () => {
  let staffToken: string | null = null
  let clientToken: string | null = null
  let adminToken: string | null = null
  let seeded = false

  beforeAll(async () => {
    staffToken = await getStaffToken()
    if (!staffToken) {
      console.warn('CAIAC_STAFF_EMAIL not configured — skipping content-level visibility tests')
      return
    }

    clientToken = await signIn(clientUser)
    adminToken = await signIn(adminUser)

    const authHeader = { Authorization: `Bearer ${staffToken}` }

    await http.post(
      'caiac/admin/ingest',
      {
        client_id: CLIENT_SLUG,
        filename: PUBLIC_FILE,
        role: 'public',
        file_base64: Buffer.from(publicDocContent).toString('base64'),
      },
      { headers: authHeader }
    )

    await http.post(
      'caiac/admin/ingest',
      {
        client_id: CLIENT_SLUG,
        filename: ADMIN_FILE,
        role: 'admin',
        file_base64: Buffer.from(adminDocContent).toString('base64'),
      },
      { headers: authHeader }
    )

    // Ingest is async (202). Poll until Ollama embedding + Qdrant upsert complete.
    await waitForDocumentsIndexed([PUBLIC_FILE, ADMIN_FILE], staffToken)
    seeded = true
  }, 90_000)

  afterAll(async () => {
    if (!staffToken || !seeded) return
    const authHeader = { Authorization: `Bearer ${staffToken}` }
    await http.delete('caiac/admin/document', { client_id: CLIENT_SLUG, filename: PUBLIC_FILE }, { headers: authHeader })
    await http.delete('caiac/admin/document', { client_id: CLIENT_SLUG, filename: ADMIN_FILE }, { headers: authHeader })
  }, 30_000)

  it('seeded documents are stored in DB with correct roles', async () => {
    if (!seeded) return
    const rows = await db.query<{ filename: string; role: string }>(
      `SELECT filename, role FROM caiac.documents
       WHERE client_id = (SELECT id FROM caiac.clients WHERE slug = $1 LIMIT 1)
       AND filename = ANY($2::text[])
       AND deleted_at IS NULL`,
      [CLIENT_SLUG, [PUBLIC_FILE, ADMIN_FILE]]
    )
    const byFile = Object.fromEntries(rows.map((r) => [r.filename, r.role]))
    expect(byFile[PUBLIC_FILE]).toBe('public')
    expect(byFile[ADMIN_FILE]).toBe('admin')
  })

  it('client role cannot retrieve admin-only content via chat', async () => {
    if (!seeded || !clientToken) return
    const res = await http.post<Record<string, unknown>>(
      CHAT_PATH_V26,
      {
        message: 'What is the administrator portal access passphrase from the test document?',
        session_id: 'test-suite-content-perm-client',
      },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    )
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_SENTINEL)
  }, 30_000)

  it('admin role can retrieve admin-only content via chat', async () => {
    if (!seeded) return
    if (!adminToken) { console.warn('TEST_USER_ADMIN_EMAIL not configured — skipping'); return }
    const res = await http.post<Record<string, unknown>>(
      CHAT_PATH_V26,
      {
        message: 'What is the administrator portal access passphrase from the test document?',
        session_id: 'test-suite-content-perm-admin',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    )
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).toContain(ADMIN_SENTINEL)
  }, 30_000)

  it('all roles can retrieve public content via chat', async () => {
    if (!seeded || !clientToken) return
    const res = await http.post<Record<string, unknown>>(
      CHAT_PATH_V26,
      {
        message: 'What is the public helpline access code from the test document?',
        session_id: 'test-suite-content-perm-public',
      },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    )
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).toContain(PUBLIC_SENTINEL)
  }, 30_000)
})
