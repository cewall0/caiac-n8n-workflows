# CAIAC Site Implementation Guide

**Audience:** Frontend developer implementing the CAIAC client dashboard and ops panel.  
**Base URL:** `https://your-n8n-host/webhook/` (replace with actual host)

---

## Session Storage

After signin, store these client-side (localStorage or secure cookie):

```json
{
  "token": "JWT...",
  "session_id": "uuid-stable-per-login",
  "webhook_secret": "per-client-secret",
  "user": { "name": "...", "email": "...", "role": "admin" }
}
```

**Critical:** `session_id` is separate from `token`. When you refresh the token, `session_id` stays the same — never overwrite it from the refresh response.

---

## HMAC Signing

Every authenticated request needs two headers generated from `webhook_secret` and the current `token`:

```javascript
const timestamp = Date.now().toString();

// The verifier receives: { timestamp, signature, signing_key: token, secret: webhook_secret }
// Confirm exact signing message format with backend team (see hmac-verifier source).
const signature = HMAC_SHA256(webhook_secret, /* confirm message format */);

headers['x-caiac-timestamp'] = timestamp;
headers['x-caiac-signature'] = signature;
```

---

## Two Request Patterns

### Body-Auth (chat / history endpoints)
```
POST /webhook/{path}
Headers: x-caiac-timestamp, x-caiac-signature
Body: { client_id: "slug", token: "JWT", ...fields }
```

### Header-Auth (admin / change-password)
```
GET|POST|DELETE /webhook/{path}
Headers:
  Authorization: Bearer {token}
  x-caiac-timestamp: {timestamp}
  x-caiac-signature: {signature}
```

---

## Endpoints

### Public — Get Client Config
```
GET /webhook/caiac/public/client-config?slug={slug}
No auth required.
```
```json
// Response
{
  "slug": "henderson",
  "name": "Henderson & Associates",
  "branding": {},
  "features": {},
  "quick_actions": [],
  "workflows": [],
  "stats": {}
}
```
Call on first page load to get branding before any auth token exists. Cache per slug.

---

### Auth — Sign In
```
POST /webhook/caiac/auth/signin
No HMAC, no token.
```
```json
// Body
{ "client_id": "henderson", "email": "user@example.com", "password": "..." }

// Response
{
  "token": "JWT...",
  "session_id": "uuid",
  "webhook_secret": "...",
  "must_change_password": false,
  "user": { "name": "Jane Smith", "email": "...", "role": "admin" }
}
```
Store all fields. If `must_change_password: true`, redirect to change-password flow before anything else.

---

### Auth — Refresh Token
```
POST /webhook/caiac/auth/refresh
Body-auth pattern.
```
```json
// Body
{ "client_id": "henderson", "token": "current-JWT" }

// Response
{ "token": "new-JWT", "session_id": "same-uuid-unchanged", "expires_at": "2026-06-18T22:00:00Z" }
```
Replace stored `token` only. `session_id` and `webhook_secret` do not change — do not overwrite them.  
Tokens expire after 1 hour. Fire refresh at ~50 min proactively.

---

### Auth — Sign Out
```
POST /webhook/caiac/auth/signout
Body-auth pattern.
```
```json
// Body
{ "client_id": "henderson", "token": "current-JWT" }

// Response
{ "success": true }
```
Clear all stored session data after success. Design is stateless — the JWT expires naturally after 1 hour regardless.

---

### Auth — Change Password
```
POST /webhook/caiac/auth/change-password
Header-auth pattern.
```
```
Headers:
  Authorization: Bearer {token}
  x-caiac-timestamp: {timestamp}
  x-caiac-signature: {signature}
```
```json
// Body
{ "current_password": "...", "new_password": "..." }

// Response (success)
{ "success": true }

// Response (wrong password) — HTTP 401
{ "error": "Current password is incorrect" }
```

---

### Chat — Send Message
```
POST /webhook/caiac/chat
Body-auth pattern.
```
```json
// Body
{ "client_id": "henderson", "token": "...", "message": "user question here" }

// Response
{
  "response": "AI answer...",
  "sources": [
    { "source": "report.pdf", "role": "public", "score": 0.92, "type": "document" }
  ],
  "session_id": "uuid",
  "message_index": 1718050000000
}
```
- `session_id` matches the one from login. Use for all history calls.
- `message_index` is a timestamp-based ID used to identify individual messages for dismiss/promote.
- Messages over 300 characters bypass RAG and go directly to the LLM (long content mode).

---

### Chat — Get Sessions
```
POST /webhook/caiac/history/sessions
Body-auth pattern.
```
```json
// Body
{ "client_id": "henderson", "token": "..." }
// Admins/owners — view another user's sessions:
{ "client_id": "henderson", "token": "...", "target_user_id": "uuid" }

// Response
{
  "sessions": [
    {
      "session_id": "uuid",
      "title": "First 60 chars of first question...",
      "last_message_at": "2026-06-18T20:00:00Z",
      "message_count": 5
    }
  ]
}
```

---

### Chat — Get Session Messages
```
POST /webhook/caiac/history/messages
Body-auth pattern.
```
```json
// Body
{ "client_id": "henderson", "token": "...", "session_id": "uuid" }

// Response
{
  "session_id": "uuid",
  "messages": [
    {
      "question": "...",
      "answer": "...",
      "sources": [...],
      "timestamp": "2026-06-18T20:00:00Z",
      "message_index": 1718050000000
    }
  ]
}
```
Messages are sorted oldest-first.

---

### Chat — Dismiss Message
```
POST /webhook/caiac/history/dismiss
Body-auth pattern. Requires role: staff / admin / owner.
```
```json
// Body
{ "client_id": "henderson", "token": "...", "session_id": "uuid", "message_index": 1718050000000 }

// Response
{ "deleted": true, "session_id": "uuid" }
```
Removes a single Q&A exchange from the session.

---

### Chat — Delete Session
```
POST /webhook/caiac/history/delete
Body-auth pattern.
```
```json
// Body
{ "client_id": "henderson", "token": "...", "session_id": "uuid" }
// Admins/owners — delete another user's session:
{ ..., "target_user_id": "uuid" }

// Response
{ "deleted": true, "session_id": "uuid" }
```

---

### Chat — Promote Message to Knowledge
```
POST /webhook/caiac/history/promote
Body-auth pattern. Requires role: staff / admin / owner.
```
```json
// Body
{ "client_id": "henderson", "token": "...", "session_id": "uuid", "message_index": 1718050000000 }

// Response
{ "promoted": true, "question": "The original question text" }
```
Promotes a Q&A pair to a permanent knowledge point — improves future RAG results for all users.

---

## Admin Endpoints

All admin endpoints use **header-auth pattern**.

```
Headers:
  Authorization: Bearer {token}
  x-caiac-timestamp: {timestamp}
  x-caiac-signature: {signature}
```

---

### Admin — List Clients
```
GET /webhook/caiac/admin/clients
Requires: role in [staff, admin, owner] OR is_caiac_staff = true
```
```json
// Response
{ "clients": [{ "slug": "henderson", "name": "Henderson & Associates" }], "count": 1 }
```

---

### Admin — List Documents
```
GET /webhook/caiac/admin/documents?client_id={slug}
Requires: matching client role [staff/admin/owner] OR is_caiac_staff = true
```
```json
// Response
{
  "documents": [
    { "filename": "report.pdf", "role": "public", "chunks_indexed": 47, "uploaded_by": "uuid", "uploaded_at": "ISO" }
  ],
  "count": 1
}
```

---

### Admin — Delete Document
```
DELETE /webhook/caiac/admin/document
Requires: is_caiac_staff = true
```
```json
// Body
{ "client_id": "henderson", "filename": "report.pdf" }

// Response
{ "deleted": true, "filename": "report.pdf" }
```
Soft-deletes DB record and hard-deletes Qdrant points. Idempotent.

---

### Admin — Ingest Preview
```
POST /webhook/caiac/admin/ingest/preview
Requires: is_caiac_staff = true
```
```json
// Body
{
  "client_id": "henderson",
  "filename": "report.pdf",
  "role": "public",
  "file_base64": "base64-encoded-pdf-bytes"
}

// Response
{ "chunks": [{ "index": 0, "text": "Extracted chunk text..." }], "count": 47 }
```
Run before ingest to review chunking. `role` must be one of: `public`, `staff`, `admin`, `owner`.  
Files over ~100 pages are rejected — split first with pypdf.

---

### Admin — Ingest Document
```
POST /webhook/caiac/admin/ingest
Requires: is_caiac_staff = true
```
Body: same as ingest preview.
```json
// Response
{ "chunks_indexed": 47, "filename": "report.pdf" }
```

---

### Admin — Client Health Check
```
GET /webhook/caiac/admin/health?client_id={slug}
Requires: matching client role [staff/admin/owner] OR is_caiac_staff = true
```
```json
// Response
{
  "status": "green",
  "vector_size": 1024,
  "document_points": 234,
  "chat_history_points": 891,
  "knowledge_points": 12,
  "embed_model": "bge-m3:latest"
}
```

---

### Admin — Run Eval
```
POST /webhook/caiac/admin/eval
Requires: is_caiac_staff = true
```
```json
// Body
{ "client_id": "henderson" }

// Response — HTTP 202
{ "job_id": "uuid", "status": "running" }
```
Async. Poll Eval Status until `status` is `passed` or `failed`.

---

### Admin — Eval Status
```
GET /webhook/caiac/admin/eval/status?job_id={uuid}
Requires: is_caiac_staff = true
```
```json
// Response
{
  "job_id": "uuid",
  "status": "passed",
  "faithfulness": 0.94,
  "context_precision": 0.89,
  "passed": true,
  "error_message": null,
  "started_at": "2026-06-18T20:00:00Z",
  "completed_at": "2026-06-18T20:01:12Z"
}
```

---

## Error Handling

| HTTP | Meaning |
|------|---------|
| 200 | Success |
| 202 | Accepted (async job started) |
| 400 | Bad request (missing/invalid fields) |
| 401 | Auth failure (bad token, wrong password, HMAC mismatch) |
| 404 | Client not found |
| 500 | Workflow execution error (treat as unknown failure) |

Unauthenticated requests to protected endpoints fail inside the workflow — n8n returns a 500. Treat non-200 on auth-protected endpoints as a potential session expiry and offer re-login.

---

## Token Lifecycle

```
Login
  → store: token, session_id, webhook_secret, user
  ↓
Every ~50 min: call /refresh
  → replace: token only
  → keep: session_id, webhook_secret (unchanged)
  ↓
Logout: call /signout
  → clear all stored session data
```

Implement proactive refresh (fire at 50 min) rather than reactive (catch 401 and retry). Reactive retry is acceptable as a fallback but produces a worse UX.

---

## Role Reference

| Role | Chat access | Dismiss/Promote | Admin endpoints |
|------|------------|-----------------|-----------------|
| `guest` / `client` | Public docs only | — | — |
| `staff` | Public + staff docs | Yes (own client) | — |
| `admin` | All docs | Yes (own client) | Own client only |
| `owner` | All docs | Yes + cross-user history | Own client only |
| `is_caiac_staff: true` | — | — | All clients |

---

## Feature Flags

Features are controlled per-client by CAIAC staff and served by n8n. The site reads them and gates UI accordingly — no direct DB access needed.

### Where features come from

**Before login** — included in the Public Config response (see endpoint above):
```json
{ "features": { "chat": true, "reviews": true, "intake": true, "crm_sync": false, "lead_scoring": false, "sms": false } }
```
Fetch on page load, cache in app state per slug.

**After login** — Full Auth also returns `features` on every authenticated call. The auth response already has it — no second request needed. Update app state from it on login/refresh.

### Implementing feature gates

Keep a single centralized helper — don't scatter inline checks:

```javascript
// Example (adapt to your framework)
function featureEnabled(features, key) {
  return features?.[key] === true;
}

// Gate a component
if (!featureEnabled(features, 'chat')) return null;

// Gate a route
if (!featureEnabled(features, 'crm_sync')) redirect('/upgrade');
```

### Disabled feature UI

Decide per feature whether disabled means **hide entirely** or **show an upgrade prompt**. This is a product decision that affects every feature gate — agree on the pattern before building gates.

### 403 responses

If a guarded n8n endpoint is hit while the feature is off, it returns HTTP 200 with:
```json
{ "error": "This feature is not enabled for your account." }
```
Handle this at your API layer — surface a consistent message rather than letting it bubble as an unknown error.

### Re-fetch strategy

- Public config: re-fetch on each page load (cheap GET, no auth)
- Auth features: already refreshed on every token refresh (every ~50 min)
- No polling needed — feature changes are staff-only and not time-sensitive

---

## Implementation Notes

1. **HMAC formula:** Confirm the exact message format with backend team by checking `hmac-verifier` source. The verifier receives `{ timestamp, signature, signing_key: JWT_token, secret: webhook_secret }`.

2. **`session_id` persistence:** Store it from the login response and keep it forever (until logout). It does not change on token refresh. Use it as the Qdrant/chat session key on every chat history call.

3. **No `x-webhook-secret` needed:** After the v2.0.0 migration, no endpoint requires an `x-webhook-secret` header. Full Auth v2.0.0 looks up the secret from the database. If you send it, it's ignored.

4. **File field name:** For ingest endpoints, use `file_base64` (not `file_b64`).

5. **CAIAC staff signin:** CAIAC internal users sign in with `client_id: "caiac"` (not a client slug). The `caiac` client row must exist in `caiac.clients` before CAIAC staff can authenticate.

---

## Backend Pre-Launch Checklist

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | JWT service `/jwt/generate` passes `jti`, `sid`, `is_caiac_staff`, `name` as claims | Dad | ✅ Done |
| 2 | `caiac` client row seeded in `caiac.clients` (needed for CAIAC staff login) | Dad | ✅ Done (Step 0 migration 2026-06-19) |
| 3 | Full Auth v2.0.0 activated | Luke | ✅ Done |
| 4 | All callers migrated to Full Auth v2.0.0 (13 standard + Chat + Change Password) | Luke | ✅ Done |
| 5 | Chat v2.4.1 auth rebuilt (inline session → Full Auth v2.0.0) | Luke | ✅ Done |
| 6 | Change Password migrated to Full Auth v2.0.0 | Luke | ✅ Done |
| 7 | Refresh: v1.0.0 deactivated → v2.0.0 active (same path) | Luke | ✅ Done |
| 8 | Signout v1.0.0 activated | Luke | ✅ Done |

---

## Intake System

### How It Works

Tally submits a webhook to n8n. n8n maps the form fields to system keys using the client's `field_map`, scores the lead with Claude, routes to CRM or Google Sheet, sends a follow-up email to the lead, and notifies the client's owner — all async after the 200 response.

Duplicate submissions (same email + client) return `{"status":"ok","note":"duplicate"}` silently with no reprocessing.

### Intake Webhook

```
POST https://[n8n-host]/webhook/intake/lead?slug={slug}&key={key}
```

No auth header — `key` is the client's `webhook_secret` from `caiac.clients`. Body is the raw Tally webhook payload. Responds 200 immediately; all processing is async.

### Tally Form Setup (per client)

1. Create form fields matching the `field_map` labels exactly (labels are the map keys)
2. Add two **hidden fields**:
   - `slug` = `{client_slug}` (hardcoded per form)
   - `key` = `{client webhook_secret}` (from `caiac.clients.webhook_secret`)
3. Set the Tally webhook destination to `POST /webhook/intake/lead` (no query params — hidden field values come through in the payload body)
4. Test with a submission — check `caiac.leads` for the row and `caiac.automation_runs` for the follow-up record

### `field_map` Format

```json
{
  "Full Name": "name",
  "Email Address": "email",
  "Phone Number": "phone",
  "Service Needed": "service",
  "Main Challenge": "challenge",
  "How Did You Hear About Us": "how_heard",
  "Business Name": "business_name",
  "Business Type": "business_type"
}
```

Keys = exact Tally field labels. Values = system keys used as Google Sheet column headers. Fields not in the map land in an `extra_fields` JSON blob column. Score Lead uses `name, business_name, business_type, challenge, how_heard` — map those system keys for best scoring results.

### Google Sheet Structure

- Tab name: `Lead Information`
- Columns: `[field_map values]` + `extra_fields` + `score` + `score_reason` + `submitted_at` + `lead_id`
- Shared with: owner only (writer access)
- Sheet ID is stored in `caiac.clients.config.lead_capture.sheet_id`

### Update Client Config (CAIAC staff only)

Use this to update a client's lead capture settings after onboarding without touching the DB directly.

```
POST https://[n8n-host]/webhook/caiac/admin/client-config
```

Uses header-auth pattern. Requires `is_caiac_staff: true`.

```json
// Body — all fields except slug are optional, only pass what's changing
{
  "slug": "henderson",
  "field_map": { "Full Name": "name", "Email Address": "email" },
  "notify_email": "new@email.com",
  "from_name": "Chad Wallace",
  "from_email": "chad@business.com",
  "sheet_id": "1ABC..."
}
```

```json
// Response
{ "success": true, "slug": "henderson", "updated": ["notify_email"], "sheet_synced": false }
```

If `field_map` changes and a `sheet_id` is set, row 1 of the `Lead Information` tab is overwritten with the new headers automatically.

---

## Onboarding System

### Onboarding Agent (internal only)

```
GET https://[n8n-host]/webhook/caiac-onboarding-agent-v1/chat
```

Opens the n8n chat UI. No external auth — lock this URL down at the network/reverse proxy level (internal CAIAC use only). The agent provisions a new client end-to-end through conversation.

**What it provisions:**
1. `caiac.clients` row (slug, name, webhook_secret, jwt_secret, config)
2. User accounts (owner + any additional users) in `caiac.users`
3. Google Sheet (created, headers set, shared with owner only)
4. CRM config stub in `caiac.client_crm_configs` (active=false until API key added)
5. Welcome email with temp password via SendGrid
6. Smoke test (verifies client row, sheet, users)
7. Post-onboarding checklist printed in chat

**Temp password format:** `FirstName+YYYYMMDD!` — e.g. `Chad20260619!`. Users must change on first login (`must_change_password: true`).

### Extending the Onboarding Agent

To add a new provisioning step (e.g. create Qdrant collection, set up SMS number):

1. Build a new sub-workflow starting with `executeWorkflowTrigger`
2. Open `[Onboarding] CAIAC Client Agent v1.0.0` (n8n ID: `HdNvh02lpP6dV059`)
3. Add a `toolWorkflow` node pointing to the new sub-workflow, connect via `ai_tool` → Onboarding Agent
4. Add the tool name to the system prompt's "Provision in Order" list and "Post-Onboarding Checklist"

The agent picks up new tools automatically — no code changes required.

### CRM Activation (after pgcrypto setup)

CRM configs are created as stubs with `active=false` during onboarding. Once pgcrypto is enabled and `CAIAC_ENCRYPTION_KEY` is set (see `docs/credential-encryption-spec.md`), activate each client's CRM config:

```sql
UPDATE caiac.client_crm_configs
SET crm_config = jsonb_set(
  crm_config,
  '{api_key_encrypted}',
  to_json(encode(pgp_sym_encrypt('{api_key}', current_setting('app.encryption_key')), 'base64'))::jsonb
),
active = true
WHERE client_id = '{uuid}' AND crm_type = 'pipedrive';
```

Until this is done, all lead routing falls back to Google Sheet regardless of CRM type.

---

## Error Monitoring

All workflow errors are caught by `[Utility] Handle Workflow Error v1.0.0` and:
- Logged to `caiac.error_log`
- Emailed to `chad@caiacdigital.com`

To query recent errors:

```sql
SELECT workflow_name, node_name, error_message, created_at
FROM caiac.error_log
ORDER BY created_at DESC
LIMIT 20;
```

---

## Pre-Launch Checklist — Intake System

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | ~~Verify `/bcrypt/hash` endpoint~~ — superseded; onboarding now uses pgcrypto directly | Dad | ✅ Done |
| 2 | pgcrypto enabled + `CAIAC_ENCRYPTION_KEY` set in n8n `.env` | Dad | ✅ Done (2026-06-20) |
| 3 | CAIAC intake Tally form created with hidden fields `slug=caiac` + `key={webhook_secret}` | Luke | ⬜ |
| 4 | CAIAC lead sheet created via onboarding agent and `sheet_id` set in caiac client config | Luke | ⬜ |
| 5 | Test intake submission end-to-end (check leads table, sheet row, follow-up email) | Luke | ⬜ |
| 6 | Activate CRM config stubs after pgcrypto setup (per client) | Luke | ⬜ |
