# n8n Instance Workflow Inventory
**Generated:** 2026-06-20  
**Total workflows:** 52 (active: 42, inactive: 9, archived/inactive: 1)  
**Source:** n8n-prod MCP, `mode=full` per workflow

---

## Special Flag Index

Before the per-workflow detail, here is the cross-cutting flag summary requested.

### HMAC Pattern Flags

All webhook endpoints receive `x-caiac-timestamp` + `x-caiac-signature` headers and pass them into **[Utility] Full Auth v2.0.0** — HMAC is embedded in Full Auth, not a standalone verifier. No production webhook calls `hmac-verifier:3000/verify` directly **except**:

- **⚠️ [Utility] Validate Auth v1.0.0** (active, `25FQf7oSGTBlLXqz`): Still active. Calls `hmac-verifier:3000/verify` directly, then `caiac_api.py` JWT verify. Does NOT query `caiac.users`, `caiac.client_features`, or set `is_caiac_staff` (hardcodes `false`). Appears **unused** — all current webhooks delegate to Full Auth v2.0.0 instead. Should be deactivated/archived.

Non-header HMAC patterns that are appropriate and intentional:
- **[Reviews] Handle Rating Click** — HMAC-signed URL tokens via [Utility] Sign Review Token (different pattern; correct for email links)
- **[Intake] Lead Capture v1.0.0** — compares `key` query param vs `webhook_secret` from DB (Tally form webhook; appropriate)
- **[Intake] CAIAC Lead Capture v2.0.0** — compares `x-caiac-key` header vs `webhook_secret` from DB (appropriate for this endpoint)

### caiac.client_features References

| Workflow | Operation | Feature Key(s) |
|----------|-----------|----------------|
| [Utility] Full Auth v2.0.0 | SELECT json_object_agg all features | all (returns map) |
| [Client] Public Config v1.0.0 | SELECT json_object_agg all features | all (returns map) |
| [Admin] Toggle Client Feature v1.0.0 | INSERT...ON CONFLICT UPDATE | chat, reviews, intake, crm_sync, lead_scoring, sms |
| [Onboarding] Seed Client Features v1.0.0 | INSERT defaults | chat(T), reviews(T), intake(T), crm_sync(F), lead_scoring(F), sms(F) |
| CAIAC RAG - Chat v2.5.0 | CHECK (from Full Auth output) | `chat` |
| [Reviews] Handle Rating Click v1.0.0 | SELECT enabled | `reviews` |
| [Reviews] Process Completed Lead v1.0.0 | SELECT enabled | `reviews` |
| [Utility] Score Lead v1.0.0 | SELECT enabled | `lead_scoring` |
| [Utility] CRM Create Lead v1.0.0 | SELECT enabled | `crm_sync` |
| [Intake] CAIAC Lead Capture v2.0.0 | SELECT enabled | `intake` |

### caiac.client_crm_configs References

| Workflow | Operation |
|----------|-----------|
| [Utility] CRM Create Lead v1.0.0 | SELECT with `pgp_sym_decrypt` (requires pgcrypto + `CAIAC_ENCRYPTION_KEY` env var) |
| [Intake] Lead Capture v1.0.0 | SELECT WHERE client_id AND active=true |
| [Onboarding] Stub CRM Config v1.0.0 | INSERT stub row (active=false, empty encrypted key) |

### pgcrypto / Encryption References

Only **[Utility] CRM Create Lead v1.0.0** uses pgcrypto:
```sql
pgp_sym_decrypt(decode(crm_config->>'api_key_encrypted','base64'), $2::text)
```
Requires `pgcrypto` extension enabled in Postgres and `CAIAC_ENCRYPTION_KEY` set in n8n environment.

### Cross-Cutting Anomalies

1. **CAIAC RAG - Chat v2.4.1**: Fallback message hardcodes `"Henderson & Associates"` — client-specific string in a generic workflow.
2. **CAIAC Admin Health v1.0.0**: Ollama URL hardcoded as `172.18.0.2:11434` instead of `ollama:11434` hostname.
3. **CAIAC RAG - Promote v1.0.0**: Node named `"Log PromoteINSERT INTO caiac.audit_log..."` — SQL text embedded in node name. Cosmetic.
4. **⚠️ CAIAC Auth - Change Password v1.0.0**: `Check Auth Valid` IF node evaluates `$('Validate Auth').item.json.user_id` but no node named "Validate Auth" exists — node is "Call Full Auth". Expression will evaluate to `undefined` → empty → always routes to 401. **This workflow is broken.**
5. **[Admin] Toggle Client Feature v1.0.0**: Missing `admin` tag.
6. **[Intake] Lead Capture v1.0.0**: Missing `intake` tag.
7. **[Onboarding] CAIAC Client Agent v1.0.0**: Missing `onboarding` tag.
8. **All 6 onboarding tool sub-workflows** (Create Client Record, Seed Client Features, Create Client User, Create Lead Sheet, Stub CRM Config, Send Welcome Email, Smoke Test) are **INACTIVE** despite the Agent that calls them being active.
9. **CAIAC Maintenance - Nightly Cleanup v1.0.0**: `Log Cleanup` Postgres node hardcodes UUIDs for `client_id` and `user_id` in the audit_log INSERT. Also reads `qdrant_url` from `client.config.ai.qdrant_url` — will produce a malformed URL if that field is null.
10. **CAIAC Demo - Lead Capture v1.2.0**: Uses `claude-sonnet-4-5` (old model), calls SendGrid directly (not via [Utility] Send Email), no `caiac.leads` DB tracking. Legacy demo workflow, functionally superseded by [Intake] CAIAC Lead Capture v2.0.0.
11. **⚠️ Table name discrepancy**: [Onboarding] Create Client Lead Sheet v1.0.0 writes to `caiac.client_platform_config`; [Utility] Get Client Review Config v1.0.0 reads from `caiac.client_review_config`. These are different table names — one may be wrong or a migration alias.
12. **[Admin] Update Client Config v1.0.0**: Error Trigger → Respond 200 OK — error path returns success response. Bug.
13. **[Admin] List Clients v1.0.0**: Sticky note says HMAC uses "Henderson's webhook_secret"; Prepare Auth Inputs node hardcodes `client_id: 'caiac'`. Stale sticky note.
14. **[Admin] List Client Documents v1.0.0**: "Get Webhook Secret" node fetches `caiac.clients WHERE slug='caiac'` but the result is never used in Prepare Auth Inputs (reads from request headers). Dead code from pre-Full Auth v2.0.0.
15. **[Utility] Score Lead v1.0.0**: Tagged `utility` and `reviews` — `reviews` tag is incorrect; this is an intake/AI tool.
16. **CAIAC Auth - Change Password v1.0.0**: Sticky note says "Auth: Bearer token + HMAC via [Utility] Validate Auth v1.0.0" — stale; actually calls Full Auth v2.0.0.

---

## Auth Workflows

### CAIAC Auth - Signin v2.0.0
- **ID**: `E9aHZeoUdtpguTaD` | **Active**: true | **Tags**: auth | **Updated**: 2026-06-19
- **Trigger**: POST webhook `/caiac/auth/signin` (no auth — this endpoint IS the auth)
- **Nodes**: Receive Request → Look Up User (Postgres LEFT JOIN `caiac.clients` + `caiac.users` WHERE slug + email; uses `user_found` sentinel to handle no-match) → Check User Exists (IF user_found = false → 401) → Check Active (IF user_active AND client_active → else 401) → Verify Password (POST `http://172.18.0.1:8000/bcrypt/verify` with password + password_hash) → Check Password Valid (IF valid=false → 401) → Generate Session IDs (Code: generates UUID `jti` + UUID `sid`) → Generate JWT (POST `http://172.18.0.1:8000/jwt/generate` with user_id, client_id, slug, role, email, is_caiac_staff, name, jti, sid, jwt_secret) → Build Response (Code: returns `{ token, session_id, webhook_secret, must_change_password, user: {id, client_id, name, email, role} }`) → Send Success Response (200)
- **DB**: Reads `caiac.clients` (by slug) and `caiac.users` (by email + client_id). No writes.
- **External**: `caiac_api.py` at `172.18.0.1:8000/bcrypt/verify` and `/jwt/generate`
- **Called by**: Nothing (public entry point)

### CAIAC Auth - Refresh v2.0.0
- **ID**: `ZCCKeovM47Z3UNNb` | **Active**: true | **Tags**: auth | **Updated**: 2026-06-19
- **Trigger**: POST webhook `/caiac/auth/refresh`
- **Auth**: Full Auth v2.0.0 (validates existing JWT before issuing new one)
- **Nodes**: Receive Refresh Request → Prepare Auth Inputs (reads body.token, body.client_id, HMAC headers) → Call Full Auth → Check Token Valid (throws if no user_id) → Fetch JWT Secret (Postgres SELECT `jwt_secret` from `caiac.clients` WHERE id AND active) → Generate New JTI (Code: new UUID, keeping same `sid`) → Reissue JWT (POST `172.18.0.1:8000/jwt/generate` with fresh jti, same sid) → Log Refresh (Postgres INSERT `caiac.audit_log` action='refresh') → Build Refresh Response (Code: `{ token, session_id (=sid), expires_at (now+1hr) }`) → Send Response (200)
- **DB**: Reads `caiac.clients`, writes `caiac.audit_log`
- **External**: `caiac_api.py` `/jwt/generate`; [Utility] Full Auth v2.0.0
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC Auth - Signout v1.0.0
- **ID**: `Q0i9qGzfEanRayou` | **Active**: true | **Tags**: auth | **Updated**: 2026-06-19
- **Trigger**: POST webhook `/caiac/auth/signout`
- **Auth**: Full Auth v2.0.0
- **Nodes**: Receive Signout Request → Prepare Auth Inputs (reads body.token, body.client_id, HMAC headers) → Call Full Auth → Check Token Valid → Log Signout (Postgres INSERT `caiac.audit_log` action='signout') → Send Signout Response (`{ success: true }`)
- **Note**: Stateless by design — JWT remains valid until natural expiry (~1hr). No server-side session revocation. Sticky note documents future path: `caiac.revoked_sessions` table keyed on `sid`.
- **DB**: Writes `caiac.audit_log`
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC Auth - Change Password v1.0.0
- **ID**: `qKqrfdGqY21WxkYw` | **Active**: true | **Tags**: auth | **Updated**: 2026-06-19
- **Trigger**: POST webhook `/caiac/auth/change-password`
- **Auth**: Full Auth v2.0.0 (with `continueOnFail: true`)
- **Nodes**: Receive Request → Prepare Auth Inputs → Call Full Auth (continueOnFail) → Check Auth Valid (IF `$('Validate Auth').item.json.user_id` is empty → 401) → Look Up User (Postgres SELECT `password_hash` from `caiac.users` WHERE id) → Verify Current Password (POST `172.18.0.1:8000/bcrypt/verify`) → Check Current Password Valid → Hash New Password (POST `172.18.0.1:8000/bcrypt/hash`) → Update Password (Postgres UPDATE `caiac.users` SET password_hash, must_change_password=false) → Send Success Response
- **⚠️ BUG**: Check Auth Valid references node `$('Validate Auth')` which does not exist in this workflow. The node is named "Call Full Auth". This expression evaluates to `undefined` (empty), so the IF always routes to 401. **This endpoint always returns 401 Unauthorized.**
- **DB**: Reads + writes `caiac.users`
- **External**: `caiac_api.py` `/bcrypt/verify`, `/bcrypt/hash`
- **Calls**: [Utility] Full Auth v2.0.0

---

## RAG / Chat Workflows

### CAIAC RAG - Chat v2.4.1
- **ID**: `Wdn95E6Yr6miEHeO` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20 | **versionCounter**: 243
- **Trigger**: POST webhook `/caiac/chat`
- **Auth**: Full Auth v2.0.0
- **Nodes**: Webhook → Prepare Auth Inputs (HMAC headers + body.token + body.client_id) → Call Full Auth → Check Token Valid → Get Client Config (Postgres SELECT `caiac.clients` WHERE slug) → Validate Request (Code: hardcoded role hierarchy dict, validates message, extracts `client.config.ai.*`) → Route Request (IF message > 300 chars → direct prompt, else → RAG path)
  - **RAG path**: Embed Query (POST Ollama `/api/embeddings`, model=bge-m3:latest) → Search Qdrant (POST `/collections/{slug}/points/search`) → Filter Results (Code: separates document/knowledge/chat_history types, deduplicates history) → Rerank Results (POST `reranker:8001/rerank`, top_n=5, min_score=0.50) → Confidence Gate (IF results > 0) → Build Context → Generate Response (POST Ollama `/api/chat`) → Format Response → Log Chat (INSERT `caiac.audit_log`) → Prepare History Point → Log to Qdrant (PUT chat_history point) → Send Response
  - **No results path**: Send No Results (hardcoded fallback: `"I don't have information on that topic in the documents provided. Please contact Henderson & Associates directly"`)
  - **Direct path**: Build Direct Prompt → Generate Direct Response → Send Direct Response
- **⚠️ FLAG**: Fallback message hardcodes "Henderson & Associates" — client-specific string in generic workflow.
- **⚠️ FLAG**: Role hierarchy is a hardcoded dict in this version (v2.5.0 replaces it with `caiac.role_hierarchy` table).
- **DB**: Reads `caiac.clients`; writes `caiac.audit_log`
- **External**: Ollama (embedding + chat), Qdrant (search + upsert), reranker:8001
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC RAG - Chat v2.5.0
- **ID**: `eZv65sCV7njNG49Z` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20
- **Trigger**: POST webhook `/caiac/chat/v2`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; Chat Feature Guard checks `features.chat === true` (403 if disabled)
- **Key differences from v2.4.1**:
  1. **Chat Feature Guard**: returns 403 if `features.chat !== true` (uses Full Auth's feature map)
  2. **Role hierarchy**: queries `caiac.role_hierarchy` WHERE role = $1 (table-driven, replaces hardcoded dict)
  3. **History injection**: fetches last 6 chat_history points from Qdrant, builds alternating user/assistant turns, injects into Ollama messages array
  4. **Dynamic fallback**: uses `client.config.ai.fallback_message` (not hardcoded)
  5. **Parallel persist**: Log Chat + Prepare History Point run in parallel, joined by Merge Logs node
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid → Chat Feature Guard (IF features.chat === true, else 403) → Get Role Permissions (Postgres `caiac.role_hierarchy`) + When Called as Sub-workflow → Get Client Config → Validate Request → Fetch Session History (Qdrant scroll last 6) → Build History Turns → Embed Query → Search Qdrant → Filter Results → Rerank Results → Confidence Gate → [found]: Build Context (history injected) → Generate Response (Ollama) → Format Response → [parallel]: Log Chat (audit_log) + Prepare History Point → Log to Qdrant → Merge Logs → Send Response | [not found]: Send No Results (dynamic fallback_message)
- **References caiac.client_features**: YES — `features.chat` via Full Auth output
- **References caiac.role_hierarchy**: YES — `SELECT visible_roles WHERE role = $1`
- **DB**: Reads `caiac.clients`, `caiac.role_hierarchy`; writes `caiac.audit_log`
- **External**: Ollama, Qdrant, reranker:8001
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC RAG - Chat History v1.0.0
- **ID**: `lg0FwGFmDWlvDc3F` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20 | **versionCounter**: 73
- **Trigger**: POST webhook `/caiac/history/sessions`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; owners/admins can view other users' history
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid → Get Client Config (Postgres) → Scroll Qdrant History (POST Qdrant scroll: filter type=chat_history + client_id + user_id, limit=1000) → Build Sessions List (Code: groups by session_id, picks latest timestamp as session title, counts messages, sorts most-recent-first) → Send Response
- **DB**: Reads `caiac.clients`
- **External**: Qdrant (scroll)
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC RAG - Chat Messages v1.0.0
- **ID**: `WZf89hltWqqZJfyP` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20 | **versionCounter**: 29
- **Trigger**: POST webhook `/caiac/history/messages`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; owners/admins can view other users' messages via target_user_id
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid → Get Client Config → Scroll Qdrant Messages (filter type=chat_history + client_id + user_id + session_id, limit=500) → Build Messages List (Code: sorts by message_index ascending) → Send Response
- **DB**: Reads `caiac.clients`
- **External**: Qdrant (scroll)
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC RAG - Chat Delete v1.0.0
- **ID**: `lTdAyxPct3gXG8FA` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20 | **versionCounter**: 23
- **Trigger**: POST webhook `/caiac/history/delete`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; owners/admins can delete for other users (target_user_id)
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid (resolves target_user_id based on role) → Get Client Config → Delete Qdrant Points (POST Qdrant /delete: filter type=chat_history + client_id + user_id + session_id) → Build Delete Response → Send Response
- **DB**: Reads `caiac.clients`
- **External**: Qdrant (delete)
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC RAG - Promote v1.0.0
- **ID**: `an4KO3aq9pLj5EDx` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20 | **versionCounter**: 46
- **Trigger**: POST webhook `/caiac/history/promote`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; role guard: owner/admin/staff only
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid (role guard) → Get Client Config → Fetch Source Point (POST Qdrant scroll: filter type=chat_history + client_id + session_id + message_index) → Prepare Knowledge Point → Embed Question (POST Ollama `/api/embeddings`) → Build Knowledge Point (type='knowledge') → Upsert Knowledge Point (PUT Qdrant) → Log Promote (INSERT `caiac.audit_log`) → Send Response
- **⚠️ FLAG**: Node named `"Log PromoteINSERT INTO caiac.audit_log..."` — SQL text embedded in node name. Cosmetic bug, no functional impact.
- **DB**: Reads `caiac.clients`; writes `caiac.audit_log`
- **External**: Qdrant (scroll + upsert), Ollama (embed)
- **Calls**: [Utility] Full Auth v2.0.0

### CAIAC RAG - Dismiss v1.0.0
- **ID**: `O47BEXbwx3UuhETz` | **Active**: true | **Tags**: rag | **Updated**: 2026-06-20 | **versionCounter**: 27
- **Trigger**: POST webhook `/caiac/history/dismiss`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; role guard: owner/admin/staff only
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid (role guard) → Get Client Config → Delete Qdrant Point (POST Qdrant /delete: filter type=chat_history + client_id + session_id + message_index) → Build Dismiss Response → Send Response
- **DB**: Reads `caiac.clients`
- **External**: Qdrant (delete)
- **Calls**: [Utility] Full Auth v2.0.0

---

## Admin Workflows

### CAIAC Admin Health v1.0.0
- **ID**: `leu2rERglqIqzhAj` | **Active**: true | **Tags**: admin | **Updated**: 2026-06-20
- **Trigger**: GET webhook `/caiac/health`
- **Auth**: Full Auth v2.0.0; is_caiac_staff check
- **Nodes**: Webhook → Prepare Auth Inputs (reads x-caiac-timestamp, x-caiac-signature, Authorization Bearer) → Call Full Auth → Check Token Valid (throws if not is_caiac_staff) → Check Postgres (SELECT now()) → Check Qdrant (GET `http://qdrant:6333/healthz`) → Check Ollama (GET `http://172.18.0.2:11434/`) → Check Reranker (GET `http://reranker:8001/`) → Check HMAC Verifier (GET `http://hmac-verifier:3000/health`) → Build Health Response (Code: aggregates up/down per service) → Send Health Response
- **⚠️ FLAG**: Ollama URL hardcoded as `172.18.0.2:11434` (IP) instead of `ollama:11434` (hostname). Other workflows use the `ollama` hostname.
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Client Health Check v1.0.0
- **ID**: `i28p9CZu2RnCsWYQ` | **Active**: true | **Tags**: admin, rag | **Updated**: 2026-06-19 | **versionCounter**: 10
- **Trigger**: GET webhook `/caiac/admin/health?client_id={slug}`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; role IN (staff/admin/owner) AND session.slug matches, OR is_caiac_staff
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid (role + slug check) → Get Collection Info (GET `http://qdrant:6333/collections/{slug}`) → Count Document Points (POST Qdrant `/points/count`, filter type=document) → Count Chat History Points (filter type=chat_history) → Count Knowledge Points (filter type=knowledge) → Merge Health Response (Code: aggregates collection status, vector_size, point counts per type, embed_model hardcoded='bge-m3:latest') → Send Health Response (200)
- **DB**: None
- **External**: Qdrant (4 sequential calls)
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] List Clients v1.0.0
- **ID**: `cO21HmBydG7gh9J9` | **Active**: true | **Tags**: admin | **Updated**: 2026-06-19 | **versionCounter**: 21
- **Trigger**: GET webhook `/caiac/admin/clients`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; role IN (staff/admin/owner) OR is_caiac_staff (no slug restriction)
- **Nodes**: Webhook → Prepare Auth Inputs (hardcodes `client_id: 'caiac'` to use CAIAC self-client's webhook_secret for HMAC) → Call Full Auth → Check Role (Code: any staff/admin/owner or CAIAC staff) → Query Clients (Postgres SELECT slug, name FROM `caiac.clients` WHERE active ORDER BY name) → Format Clients Response → Send Clients Response (`{ clients: [{slug, name}], count: N }`)
- **⚠️ FLAG**: Sticky note says "HMAC envelope uses Henderson's webhook_secret" but Prepare Auth Inputs hardcodes `client_id: 'caiac'`. Stale documentation — actually uses CAIAC self-client secret.
- **DB**: Reads `caiac.clients`
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] List Client Documents v1.0.0
- **ID**: `FQfeOp3yZfLwnuFf` | **Active**: true | **Tags**: admin | **Updated**: 2026-06-19 | **versionCounter**: 34
- **Trigger**: GET webhook `/caiac/admin/documents?client_id={slug}`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; role IN (staff/admin/owner) AND session.slug matches, OR is_caiac_staff
- **Nodes**: Webhook → Get Webhook Secret (Postgres SELECT `webhook_secret` from `caiac.clients` WHERE slug='caiac' — **dead code; result not used**) → Prepare Auth Inputs (reads from request headers) → Call Full Auth → Check Token Valid (slug match or staff) → Query Documents (Postgres SELECT filename, role, chunks_indexed, uploaded_by, uploaded_at FROM `caiac.documents` JOIN `caiac.clients` WHERE slug AND deleted_at IS NULL ORDER BY uploaded_at DESC) → Format Documents Response → Send Documents Response
- **⚠️ FLAG**: "Get Webhook Secret" node is dead code — its output is never referenced in Prepare Auth Inputs. Leftover from pre-Full Auth v2.0.0 pattern.
- **DB**: Reads `caiac.clients`, `caiac.documents`
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Ingest Document v1.0.0
- **ID**: `0VTWcZB0P0oTFo9c` | **Active**: true | **Tags**: admin, rag | **Updated**: 2026-06-19 | **versionCounter**: 14
- **Trigger**: POST webhook `/caiac/admin/ingest`
- **Auth**: Full Auth v2.0.0; is_caiac_staff only; also validates `role` parameter (public/staff/admin/owner)
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid (validates role param) → Check File Size (Code: estimates pages from base64 length, blocks if >100 pages) → Call Docling (POST `docling:8002/extract`, chunk_size=450, overlap=75, min_tokens=40, timeout=120s) → Embed and Prepare Points (Code: splits into per-chunk items) → Call Ollama Embed (POST `http://ollama:11434/api/embeddings`, model=bge-m3:latest, per chunk) → Aggregate Points (Code: zips embeddings + chunks, builds Qdrant point objects) → Upsert to Qdrant (PUT `http://qdrant:6333/collections/{client_slug}/points`) → Get Target Client UUID (Postgres SELECT id FROM `caiac.clients` WHERE slug) → Insert Document Record (INSERT `caiac.documents`: client_id, filename, role, uploaded_by, uploaded_at, chunks_indexed) → Format Ingest Response → Send Ingest Response
- **DB**: Reads `caiac.clients`; writes `caiac.documents`
- **External**: Docling (chunking), Ollama (embed), Qdrant (upsert)
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Ingest Preview v1.0.0
- **ID**: `cM7pw170pRGfCWQV` | **Active**: true | **Tags**: admin, rag | **Updated**: 2026-06-19 | **versionCounter**: 12
- **Trigger**: POST webhook `/caiac/admin/ingest/preview`
- **Auth**: Full Auth v2.0.0; is_caiac_staff only
- **Nodes**: Webhook → Prepare Auth Inputs (reads Bearer + HMAC headers + x-webhook-secret) → Call Full Auth → Check Token Valid (is_caiac_staff check) → Call Docling (POST `docling:8002/extract` with file_base64, chunk_size=450, overlap=75, min_tokens=40, timeout=120s) → Parse Docling Chunks → Send Preview Response (200 with chunks array)
- **Note**: Dry-run only — no DB writes, no Qdrant writes.
- **External**: Docling
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Delete Document v1.0.0
- **ID**: `uPCEN5Kf7bkyR5qv` | **Active**: true | **Tags**: admin, rag | **Updated**: 2026-06-19 | **versionCounter**: 11
- **Trigger**: DELETE webhook `/caiac/admin/document`; also executeWorkflowTrigger
- **Auth**: Full Auth v2.0.0; is_caiac_staff only
- **Body**: `{ client_id: slug, filename: string }`
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid (is_caiac_staff) → Get Target Client UUID (Postgres SELECT id WHERE slug) → Soft Delete Document (Postgres UPDATE `caiac.documents` SET deleted_at=NOW() WHERE client_id + filename + deleted_at IS NULL; returns rows_deleted count) → Was Document Found? (IF rows_deleted > 0) → [found]: Delete Qdrant Points (POST Qdrant /delete filter source=filename AND client_id=slug) → Send Delete Response (200) | [not found]: Send Not Found Response (404)
- **DB**: Reads `caiac.clients`; soft-deletes `caiac.documents`
- **External**: Qdrant (delete by payload filter)
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Toggle Client Feature v1.0.0
- **ID**: `QO47fCP6XNuLyS0i` | **Active**: true | **Tags**: NONE (missing admin tag) | **Updated**: 2026-06-20 | **versionCounter**: 1
- **Trigger**: POST webhook `/caiac/admin/client-feature`
- **Auth**: Full Auth v2.0.0; is_caiac_staff check
- **Body**: `{ slug, feature, enabled }`
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Validate Request (Code: staff check; validates slug, feature, enabled; checks against known registry: `chat|reviews|intake|crm_sync|lead_scoring|sms`) → Feature Known? (IF) → [known]: Upsert Feature (Postgres INSERT INTO `caiac.client_features` ON CONFLICT (client_id, feature) DO UPDATE, includes enabled_by=user_id; sub-selects client_id by slug) → Respond 200 | [unknown]: Respond 400
- **References caiac.client_features**: YES — writes to it
- **errorWorkflow**: Handle Workflow Error
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Update Client Config v1.0.0
- **ID**: `b8StToReJzg1bzKp` | **Active**: true | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: POST webhook `/caiac/admin/client-config` (webhook path: `caiac/admin/client-config`)
- **Auth**: Full Auth v2.0.0; is_caiac_staff only
- **Updatable fields**: `field_map`, `notify_email`, `from_name`, `from_email`, `sheet_id` (all in `config.lead_capture`)
- **Nodes**: Receive Request → Prepare Auth Inputs → Call Full Auth (onError=continueRegularOutput) → Check Auth Valid (staff check + validates required `slug` + at least one updatable field) → Get Current Client Config (Postgres SELECT id, config, sheet_id) → Client Exists? (IF) → [not found]: 404 | [exists]: Build Config Patch (Code: dynamically builds nested `jsonb_set` SQL for changed fields) → Update Client Config (Postgres dynamic UPDATE `caiac.clients` SET config = jsonb_set(…)) → Sync Sheet Headers (IF field_map changed AND sheet_id set) → [yes]: Build New Headers → Overwrite Sheet Headers (PUT Google Sheets API `values/Lead Information!A1`) → Respond 200 OK | [no]: Respond 200 OK
- **⚠️ BUG**: Error Trigger → Respond 200 OK — error path returns 200 success response.
- **DB**: Reads + writes `caiac.clients.config`
- **External**: Google Sheets API (if field_map updated); credential: "Caiac Group Sheets"
- **Calls**: [Utility] Full Auth v2.0.0
- **errorWorkflow**: Handle Workflow Error

### [Admin] Run Ragas Eval v2.0.0
- **ID**: `b9GEiJleW09eA5YO` | **Active**: true | **Tags**: admin, rag | **Updated**: 2026-06-19 | **versionCounter**: 24
- **Trigger**: POST webhook `/caiac/admin/eval`
- **Auth**: Full Auth v2.0.0; is_caiac_staff only
- **Nodes**: Webhook → Prepare Auth Inputs → Call Full Auth → Check Token Valid → Insert Eval Job (Postgres INSERT INTO `caiac.eval_jobs`, sub-selects client.id from slug in the values) → Trigger Async Eval (POST `http://172.18.0.1:8000/ragas/eval/async` with client_id + job_id) → Respond to Webhook (202, `{ job_id, status: "running" }`)
- **DB**: Writes `caiac.eval_jobs`
- **External**: `caiac_api.py` `/ragas/eval/async`
- **Calls**: [Utility] Full Auth v2.0.0

### [Admin] Eval Status v1.0.0
- **ID**: `FEGd6dvYVn5Gb6UJ` | **Active**: true | **Tags**: admin | **Updated**: 2026-06-19 | **versionCounter**: 14
- **Trigger**: GET webhook `/caiac/admin/eval/status?job_id={id}`
- **Auth**: Full Auth v2.0.0; is_caiac_staff only; resolves client slug from eval_jobs before calling Full Auth
- **Nodes**: Webhook → Resolve Client Slug (Postgres JOIN `caiac.eval_jobs` with `caiac.clients` WHERE job_id — gets slug to pass to Full Auth) → Prepare Auth Inputs → Call Full Auth → Check Token Valid → Query Eval Job (Postgres SELECT status, faithfulness, context_precision, passed, error_message, started_at, completed_at FROM `caiac.eval_jobs`) → Respond to Webhook (200 with job status)
- **DB**: Reads `caiac.eval_jobs`, `caiac.clients`
- **Calls**: [Utility] Full Auth v2.0.0

---

## Intake / Lead Capture Workflows

### [Intake] Lead Capture v1.0.0
- **ID**: `5eVBapje2TWpeMvj` | **Active**: true | **Tags**: NONE (missing `intake` tag) | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: POST webhook `/webhook/intake/lead?slug={slug}&key={key}`
- **Auth**: webhook_secret comparison (`key` query param vs `webhook_secret` from `caiac.clients`) — NOT Full Auth v2.0.0; appropriate for Tally form webhooks
- **Nodes**: Webhook → Validate Payload (slug + key required) → Get Client Config (Postgres SELECT from `caiac.clients` WHERE slug) → Check Webhook Key (IF webhook_secret === key) → [invalid]: 401 | [valid]: Check Intake Feature (Postgres SELECT enabled FROM `caiac.client_features` WHERE feature='intake') → Intake Feature Enabled? → [disabled]: 403 | [enabled]: Extract and Fingerprint Lead (Code: applies field_map from client config, generates FNV-like hash fingerprint from email) → Check Existing Lead (Postgres SELECT `caiac.leads` WHERE intake_fingerprint + client_id) → Is New Lead (IF) → [duplicate]: Upsert Existing Lead to Sheet + Respond 200 existing | [new]: Prepare Score Lead Input → Score Lead (executeWorkflow → [Utility] Score Lead) → Insert Lead to DB (INSERT `caiac.leads`: client_id, crm_type='form', source_id, source_channel='form', lifecycle_stage='intake', intake_fingerprint, qualification_score, qualification_score_reason) → Insert Automation Run (INSERT `caiac.automation_runs` state='pending') → Send Follow-up Email (executeWorkflow → [Utility] Send Email) → Mark Run Sent (UPDATE `caiac.automation_runs` state='sent') → Notify Owner (executeWorkflow → [Utility] Send Email) → Log AI Usage (INSERT `caiac.ai_usage_log`) → Append Lead to Sheet (Google Sheets appendOrUpdate, match on Lead Email) → Respond 200 new
- **Error**: Error Trigger → Log Error to DB (INSERT `caiac.error_log`)
- **References caiac.client_features**: YES — `feature = 'intake'`
- **DB**: Reads `caiac.clients`, `caiac.client_features`, `caiac.leads`; writes `caiac.leads`, `caiac.automation_runs`, `caiac.ai_usage_log`
- **External**: Google Sheets (credential: "Caiac Group Sheets")
- **Calls**: [Utility] Score Lead, [Utility] Send Email
- **errorWorkflow**: Handle Workflow Error

### [Intake] CAIAC Lead Capture v2.0.0
- **ID**: `FXGmlYKi5Wy1QKX6` | **Active**: true | **Tags**: intake | **Updated**: 2026-06-20 | **versionCounter**: 5
- **Trigger**: POST webhook `/intake/caiac/lead?slug=caiac`
- **Auth**: `x-caiac-key` header compared to `webhook_secret` from `caiac.clients` — NOT Full Auth v2.0.0; appropriate for form webhook
- **Body**: Typeform-shaped `{ data: { fields: [...] } }`
- **Nodes**: Receive Lead Form → Validate Payload (IF `body.data.fields` is array) → [invalid]: 400 | [valid]: Get Client Config (Postgres SELECT from `caiac.clients` WHERE slug, reads notify_email, sheet_id, from_name, from_email from `config.lead_capture`) → Check Webhook Secret (IF x-caiac-key === webhook_secret) → [invalid]: 401 | [valid]: Check Intake Feature (Postgres SELECT `caiac.client_features` WHERE feature='intake') → Intake Feature Enabled? → [disabled]: 403 | [enabled]: Extract and Fingerprint Lead (Code: maps Typeform fields by label, generates deterministic fingerprint from email) → Check Existing Lead → Is Existing Lead (IF) → [existing]: Upsert Existing Lead to Sheet → Respond 200 Existing | [new]: Prepare Score Lead Input → Score Lead (executeWorkflow) → Insert Lead to DB (`caiac.leads`) → Insert Automation Run (`caiac.automation_runs` state='pending') → Send Follow-up Email → Mark Run Sent → Notify Owner → Log AI Usage (`caiac.ai_usage_log`) → Append Lead to Sheet → Respond 200 New Lead
- **Error**: Error Trigger → Log Error to DB (`caiac.error_log`)
- **Note**: CAIAC's own inbound intake form. PII (name/email/phone) stored in Sheet only, not in `caiac.leads`.
- **References caiac.client_features**: YES — `feature = 'intake'`
- **DB**: Reads `caiac.clients`, `caiac.client_features`; writes `caiac.leads`, `caiac.automation_runs`, `caiac.ai_usage_log`
- **External**: Google Sheets (credential: "Caiac Group Sheets")
- **Calls**: [Utility] Score Lead, [Utility] Send Email

---

## Reviews Workflows

### [Reviews] Check Review Link Health v1.0.0
- **ID**: `qicDCvaDemfb9gdw` | **Active**: true | **Tags**: reviews | **Updated**: 2026-06-19
- **Trigger**: Schedule — weekly interval
- **Nodes**: Run Weekly → Set No Filter → Get All Active Clients (executeWorkflow → [Utility] Get Client Review Config, no filter = all active) → fan-out: Check Review Link (HTTP GET google_review_link, follow redirects, neverError) → Combine → Merge by Position → Evaluate Link Health (Code: statusCode 200-399 = healthy) → Collect Broken Links → Check If Any Broken (IF) → [broken]: Build Alert Email → Send Alert Email (executeWorkflow → [Utility] Send Email, to: `admin@caiacdigital.com`, from: `no_reply@caiacdigital.com`) | [none]: end
- **DB**: None directly (reads via [Utility] Get Client Review Config)
- **Calls**: [Utility] Get Client Review Config v1.0.0, [Utility] Send Email v1.0.0

### [Reviews] Poll Sheets For Completed Leads v1.0.0
- **ID**: `rsuysKkzQZ3Muse2` | **Active**: true | **Tags**: reviews | **Updated**: 2026-06-19 | **versionCounter**: 6
- **Trigger**: Schedule — hourly
- **Nodes**: Run Hourly → Set Source Type ('sheet') → Get Active Sheet Clients (executeWorkflow → [Utility] Get Client Review Config) → Loop Over Clients (SplitInBatches) → Read Client Lead Sheet (Google Sheets read, Lead Information tab) → Read Review Status Tab (Google Sheets read, Review Status tab) → Filter Qualifying Leads (Code: builds `sentContacts` set from Review Status rows with Review Email Sent=TRUE; filters Lead Information for Status='Completed' AND contact not in sentContacts; produces items with client_slug, lead_name, lead_email, service, source_type, source_ref) → Check For Leads (IF qualifying > 0) → Loop Over Qualifying Leads (SplitInBatches) → Call Process Completed Lead (executeWorkflow → [Reviews] Process Completed Lead v1.0.0, continueRegularOutput) → loop back
- **External**: Google Sheets (credential: "Caiac Group Sheets")
- **Calls**: [Utility] Get Client Review Config v1.0.0, [Reviews] Process Completed Lead v1.0.0

### [Reviews] Process Completed Lead v1.0.0
- **ID**: `9TiCOFBEFCksLWyM` | **Active**: true | **Tags**: reviews | **Updated**: 2026-06-20 | **versionCounter**: 4
- **Trigger**: executeWorkflowTrigger (sub-workflow only)
- **Inputs**: client_slug, lead_name, lead_email, service, source_type, source_ref, lead_sheet_id, lead_sheet_tab
- **Nodes**: When Called as Sub-workflow → Get Client Config (executeWorkflow → [Utility] Get Client Review Config) → Check Reviews Feature (Postgres SELECT `caiac.client_features` WHERE slug AND feature='reviews') → Reviews Enabled for Client? (IF) → [disabled]: Skip Review Processing | [enabled]: Merge Lead and Config → Prepare Sign Token Inputs → Sign Review Token (executeWorkflow → [Utility] Sign Review Token, action='sign') → Build Review Links and Email (Code: constructs good/bad URLs to `https://flows.caiacdigital.com/webhook/review-rating`, builds HTML email) → Send Review Email (executeWorkflow → [Utility] Send Email) → Prepare Mark Review Sent Inputs → Mark Review Sent (executeWorkflow → [Utility] Mark Review Sent)
- **References caiac.client_features**: YES — `feature = 'reviews'`
- **DB**: Reads via [Utility] Get Client Review Config (`caiac.client_review_config` + `caiac.clients`)
- **Calls**: [Utility] Get Client Review Config, [Utility] Sign Review Token, [Utility] Send Email, [Utility] Mark Review Sent
- **Called by**: [Reviews] Poll Sheets For Completed Leads

### [Reviews] Handle Rating Click v1.0.0
- **ID**: `XSQemRjTkLP0D15x` | **Active**: true | **Tags**: reviews | **Updated**: 2026-06-20
- **Trigger**: GET webhook `/review-rating?t={token}&p={payload_b64}&r=good|bad` (public — clicked from email link; no header auth by design)
- **Auth**: HMAC-signed URL token verification via [Utility] Sign Review Token (not the x-caiac-timestamp/signature header pattern)
- **Nodes**: Webhook → Parse and Decode Params (Code: base64url decode payload → client_slug, source_type, source_ref) → Get Client Config (executeWorkflow → [Utility] Get Client Review Config) → Merge Token Data and Config → Check Reviews Feature (Postgres SELECT `caiac.client_features` WHERE slug AND feature='reviews') → Reviews Feature Enabled? (IF) → [disabled]: 403 | [enabled]: Verify Review Token (executeWorkflow → [Utility] Sign Review Token, action='verify') → Check Token Valid (IF valid) → [invalid]: 410 expired | [valid]: Prepare Record Rating → Record Rating (executeWorkflow → [Utility] Record Rating) → Check Rating Type → [good]: Respond Good Redirect (302 → google_review_link) | [bad]: Prepare Mark Needs Followup → Mark Needs Followup (executeWorkflow → [Utility] Record Rating, Needs Followup=true) → Prepare Followup Email → Send Followup Email (executeWorkflow → [Utility] Send Email) → Respond Sorry Page (200 HTML)
- **References caiac.client_features**: YES — `feature = 'reviews'`
- **DB**: Reads via [Utility] Get Client Review Config
- **Calls**: [Utility] Get Client Review Config, [Utility] Sign Review Token, [Utility] Record Rating, [Utility] Send Email

---

## Onboarding Workflows

### [Onboarding] CAIAC Client Agent v1.0.0
- **ID**: `HdNvh02lpP6dV059` | **Active**: true | **Tags**: NONE (missing `onboarding`) | **Updated**: 2026-06-20
- **Trigger**: Chat Trigger (n8n LangChain `chatTrigger` — internal n8n UI chat, not an external API)
- **LLM**: Claude Sonnet 4.6 (`claude-sonnet-4-6`, credential: "Anthropic API Key" `NUyoQ0Dq1ABvkufU`), temp=0.3, maxTokens=2048
- **Agent type**: toolsAgent (n8n LangChain Agent) with Window Buffer Memory (30 turns)
- **Tool sub-workflows**:
  - `create_client` → [Onboarding] Create Client Record v1.0.0 (`AvNGCwKF3BtOLl2Y`)
  - `seed_features` → [Onboarding] Seed Client Features v1.0.0 (`lCCkJfPFbNNbHWiI`) — call immediately after create_client
  - `create_user` → [Onboarding] Create Client User v1.0.0 (`8MnKBfVjMUrvbmMq`)
  - `create_lead_sheet` → [Onboarding] Create Lead Sheet v1.0.0 (`mXtKgZzK7Ppncywr`)
  - `stub_crm_config` → [Onboarding] Stub CRM Config v1.0.0 (`8AZ4sMI7CRXByH8I`)
  - `send_welcome_email` → [Onboarding] Send Welcome Email v1.0.0 (`Gh2FE8DSQbulc4hL`)
  - `smoke_test` → [Onboarding] Smoke Test v1.0.0 (`1Wmm68uc0ZnWegVK`)
- **⚠️ FLAG**: Agent is active but ALL 7 tool sub-workflows are INACTIVE. Agent calls will fail when it tries to invoke any tool.
- **errorWorkflow**: Handle Workflow Error
- **Calls**: All 7 onboarding sub-workflows listed above

### [Onboarding] Create Client Record v1.0.0
- **ID**: `AvNGCwKF3BtOLl2Y` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Inputs**: slug, name, vertical, notify_email, from_name, from_email, field_map
- **Nodes**: When Called as Sub-workflow → Build Client Config (Code: validates slug regex, generates hex webhook_secret (48 chars) + jwt_secret (64 chars) using Math.random, builds config JSON with lead_capture fields) → Insert Client Row (Postgres INSERT INTO `caiac.clients` slug, name, webhook_secret, jwt_secret, config, tier='starter' RETURNING id, slug, webhook_secret)
- **DB**: Writes `caiac.clients`
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `create_client`)

### [Onboarding] Seed Client Features v1.0.0
- **ID**: `lCCkJfPFbNNbHWiI` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-20 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Input**: client_id (UUID)
- **Nodes**: Workflow Input → Seed Default Features (Postgres INSERT INTO `caiac.client_features` (client_id, feature, enabled, enabled_by) — chat=true, reviews=true, intake=true, crm_sync=false, lead_scoring=false, sms=false — all ON CONFLICT DO NOTHING) → Build Output
- **References caiac.client_features**: YES — inserts default rows
- **DB**: Writes `caiac.client_features`
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `seed_features`)

### [Onboarding] Create Client User v1.0.0
- **ID**: `8MnKBfVjMUrvbmMq` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_id, first_name, last_name, email, role
- **Nodes**: When Called as Sub-workflow → Generate Temp Password (Code: builds `{FirstName}{YYYYMMDD}!` pattern) → Hash Password (POST `172.18.0.1:8000/bcrypt/hash`) → Insert User Row (Postgres INSERT INTO `caiac.users` with must_change_password=true, active=true, is_caiac_staff=false RETURNING id) → Return User Details (Code: returns user_id, name, email, role, temp_password)
- **DB**: Writes `caiac.users`
- **External**: `caiac_api.py` `/bcrypt/hash`
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `create_user`)

### [Onboarding] Create Lead Sheet v1.0.0
- **ID**: `mXtKgZzK7Ppncywr` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_id, client_name, owner_email, field_map
- **Nodes**: When Called as Sub-workflow → Build Headers (Code: derives columns from field_map values + standard: extra_fields, score, score_reason, submitted_at, lead_id; sets title="{client_name} — Lead Information") → Create Spreadsheet (POST Google Sheets API, single sheet tab "Lead Information") → Write Header Row (POST `/values/Lead Information!A1:append`) → Share with Owner (POST Google Drive API `/files/{id}/permissions`, role=writer, emailAddress=owner_email) → Save Sheet ID to Config (Postgres UPDATE `caiac.clients` SET `config.lead_capture.sheet_id` = spreadsheetId WHERE id) → Return Sheet Details (spreadsheetId + spreadsheetUrl)
- **DB**: Writes `caiac.clients.config.lead_capture.sheet_id`
- **External**: Google Sheets API, Google Drive API (credential: "Caiac Group Sheets")
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `create_lead_sheet`)

### [Onboarding] Create Client Lead Sheet v1.0.0
- **ID**: `WL6OUEmJ4Z5ZGsr8` | **Active**: true | **Tags**: onboarding | **Updated**: 2026-06-19 | **versionCounter**: 16
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_slug, client_name, google_review_link, client_admin_email, lead_sheet_tab
- **Purpose**: Creates the review-request lead sheet (different from Create Lead Sheet v1.0.0 above — serves the reviews workflow, not the intake workflow)
- **Nodes**: When Called as Sub-workflow → Validate Review Link (HTTP GET google_review_link, neverError) → Check Link Valid (IF 200-399) → [invalid]: Throw Invalid Link | [valid]: Create Spreadsheet → Write Lead Info Headers ("Lead Name, Lead Email, Lead Phone, Service, Status, Notes") → Add Review Status Tab (batchUpdate addSheet) → Write Review Status Headers ("Lead Email, Lead Phone, Review Email Sent, Review Email Sent Date, Rating Received, Needs Followup, Review Confirmed, Last Resend Date") → Set Status Dropdown (batchUpdate setDataValidation on Status col E) → Protect Header Rows (batchUpdate addProtectedRange on both tabs, warningOnly=true) → Finalize Config Data (Code: generates 64-hex link_signing_secret) → Upsert Config to Postgres (INSERT INTO `caiac.client_platform_config` ON CONFLICT (client_slug) DO UPDATE) → Return Success
- **⚠️ FLAG**: Writes to `caiac.client_platform_config` but [Utility] Get Client Review Config reads from `caiac.client_review_config`. Table name discrepancy — one may be wrong.
- **DB**: Writes `caiac.client_platform_config`
- **External**: Google Sheets API, Google Drive API (via Sheets credential)
- **Called by**: Not currently wired to any workflow (standalone sub-workflow; separate from the Agent's tools)

### [Onboarding] Stub CRM Config v1.0.0
- **ID**: `8AZ4sMI7CRXByH8I` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_id, crm_type
- **Nodes**: When Called as Sub-workflow → Has CRM (IF crm_type != 'none') → [none]: Return Skipped | [has CRM]: Insert CRM Stub (Postgres INSERT INTO `caiac.client_crm_configs` with empty api_key_encrypted stub, active=false RETURNING id)
- **Note**: Stub only — active=false until pgcrypto is set up and real key encrypted.
- **References caiac.client_crm_configs**: YES — inserts stub row
- **DB**: Writes `caiac.client_crm_configs`
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `stub_crm_config`)

### [Onboarding] Send Welcome Email v1.0.0
- **ID**: `Gh2FE8DSQbulc4hL` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_name, client_slug, first_name, email, role, temp_password, sheet_url, webhook_secret
- **Nodes**: When Called as Sub-workflow → Build Welcome Email (Code: builds HTML; if role=owner includes sheet URL + Tally hidden field setup with slug and webhook_secret; includes temp password and must_change_password warning) → Send Email (executeWorkflow → [Utility] Send Email v1.0.0, from: `caiacgroup@gmail.com`)
- **DB**: None
- **Calls**: [Utility] Send Email v1.0.0
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `send_welcome_email`)

### [Onboarding] Smoke Test v1.0.0
- **ID**: `1Wmm68uc0ZnWegVK` | **Active**: **false** | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 1
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_id, client_slug
- **Nodes**: When Called as Sub-workflow → Verify Client Provisioning (Postgres SELECT: client_exists, client_active, `config.lead_capture.sheet_id != ''`, user_count WHERE slug) → Evaluate Results (Code: checks 4 assertions — client_exists, client_active, sheet_id_set, users_created; returns `{ status: 'pass'|'fail', checks: [...], failed_checks: [...] }`)
- **DB**: Reads `caiac.clients`, `caiac.users`
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Onboarding] CAIAC Client Agent (tool: `smoke_test`)

---

## Utility Workflows

### [Utility] Full Auth v2.0.0
- **ID**: `XWbmBI9NYdwK80eg` | **Active**: true | **Tags**: auth | **Updated**: 2026-06-20
- **Trigger**: executeWorkflowTrigger (sub-workflow only)
- **Inputs**: token, timestamp, signature, client_id (client_id is backward-compat; real client_id extracted from JWT)
- **Nodes**: Auth Input → Decode JWT (Code: base64url decode payload, extract client_id + jti + sid — NO signature verification yet) → Get Client Secret (Postgres SELECT `webhook_secret` from `caiac.clients` WHERE id = extracted_client_id AND active=true) → Verify HMAC (POST `hmac-verifier:3000/verify` with signing_key=JWT token, timestamp, signature, secret=webhook_secret) → Check HMAC Valid → Verify JWT (POST `172.18.0.1:8000/jwt/verify-with-lookup`) → Check JWT Valid → Get User Details (Postgres SELECT `caiac.users` WHERE id = user_id AND active=true) → Get Client Features (Postgres SELECT `json_object_agg(feature, enabled)` FROM `caiac.client_features` WHERE client_id) → Build Auth Output
- **Output**: `{ user_id, role, client_id, slug, name, email, is_caiac_staff, session_id (=sid), jti, features }`
- **References caiac.client_features**: YES — always queries for ALL features for every caller
- **DB**: Reads `caiac.clients`, `caiac.users`, `caiac.client_features`
- **External**: `hmac-verifier:3000/verify`, `caiac_api.py` `/jwt/verify-with-lookup`
- **Called by**: ~15+ webhook workflows

### [Utility] Validate Auth v1.0.0
- **ID**: `25FQf7oSGTBlLXqz` | **Active**: true | **Tags**: auth | **Updated**: 2026-06-19 | **versionCounter**: 3
- **Trigger**: executeWorkflowTrigger (sub-workflow only)
- **Inputs**: timestamp, signature, token, webhook_secret (caller must pre-fetch webhook_secret)
- **Nodes**: Auth Input → Verify HMAC (POST `hmac-verifier:3000/verify` directly, signing_key=token, secret=webhook_secret) → Check HMAC Valid → Verify JWT (POST `172.18.0.1:8000/jwt/verify-with-lookup`) → Check JWT Valid (Code: returns `{ user_id, role, client_id, slug, email, is_caiac_staff: false }` — **is_caiac_staff hardcoded false**)
- **⚠️ FLAG — OLD AUTH SUB-WORKFLOW**: Predecessor to Full Auth v2.0.0. Does NOT query `caiac.users`, `caiac.client_features`, or set `is_caiac_staff`. Appears **UNUSED** — no current workflow calls it (Change Password sticky note references it but the actual node calls Full Auth v2.0.0). Should be deactivated and archived.
- **DB**: None
- **External**: `hmac-verifier:3000/verify` (direct call), `caiac_api.py` `/jwt/verify-with-lookup`

### [Utility] Handle Workflow Error v1.0.0
- **ID**: `hZk1sE4UP2Vmn5QV` | **Active**: true | **Tags**: NONE | **Updated**: 2026-06-19
- **Trigger**: Error Trigger (centralized handler; referenced as `errorWorkflow` in ~10+ workflows)
- **Nodes**: Error Trigger → Extract Error Details (Code: pulls workflow_name, node_name, error_message, execution_url from n8n error payload) → Log to Error Log (Postgres INSERT INTO `caiac.error_log`: workflow_name, node_name, error_message, execution_url) → Prepare Error Email (Code: builds HTML error alert email) → Send Error Alert (executeWorkflow → [Utility] Send Email v1.0.0, to: `cewall0@gmail.com` or configured admin)
- **DB**: Writes `caiac.error_log`
- **Calls**: [Utility] Send Email v1.0.0
- **Called by**: Multiple workflows via n8n `errorWorkflow` setting

### [Utility] Send Email v1.0.0
- **ID**: `tdI7VopcP5vpet6J` | **Active**: true | **Tags**: utility | **Updated**: 2026-06-19 | **versionCounter**: 4
- **Trigger**: executeWorkflowTrigger (sub-workflow only)
- **Inputs**: to, from, subject, html
- **Nodes**: When Called as Sub-workflow → Validate Inputs (Code: checks required fields; throws if missing) → Send Via SendGrid (POST `https://api.sendgrid.com/v3/mail/send`, credential: "SendGrid API" `V2oX0Dl2H30bjEdO`) → Format Send Result (`{ success: true, status_code: 202 }`)
- **Note**: Single abstraction layer for all email sending. To switch email providers, change only this workflow.
- **DB**: None
- **External**: SendGrid API
- **Called by**: [Reviews] Process Completed Lead, [Reviews] Check Review Link Health, [Reviews] Handle Rating Click, [Intake] Lead Capture v1.0.0, [Intake] CAIAC Lead Capture v2.0.0, [Utility] Handle Workflow Error, [Onboarding] Send Welcome Email

### [Utility] Score Lead v1.0.0
- **ID**: `6lzuSE2b7txCLWm2` | **Active**: true | **Tags**: utility, reviews (reviews tag is incorrect) | **Updated**: 2026-06-20 | **versionCounter**: 4
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_id, name, business_name, business_type, challenge, how_heard, from_name
- **Outputs**: qualification_score, qualification_score_reason, email_subject, email_body, tokens_in, tokens_out, cost_estimate
- **Nodes**: Execute Workflow Trigger → Check Lead Scoring Feature (Postgres SELECT `caiac.client_features` WHERE feature='lead_scoring'; defaults to `true` if no row) → Lead Scoring Enabled? (IF) → [disabled]: Return Default Score (score=0) | [enabled]: Restore Trigger Data → Call Claude Score and Draft (POST `https://api.anthropic.com/v1/messages`, model=claude-sonnet-4-6, credential: "Anthropic API Key"; prompt includes business context + lead fields; requests JSON output: score 1-10, reason, email_subject, email_body) → Parse Score Response (Code: parses Claude JSON output; calculates cost at $3/M input + $15/M output; appends AI disclaimer to email body; falls back gracefully on parse error)
- **References caiac.client_features**: YES — `feature = 'lead_scoring'` (defaults enabled if no feature row)
- **DB**: Reads `caiac.client_features`
- **External**: Anthropic API (`claude-sonnet-4-6`)
- **Called by**: [Intake] Lead Capture v1.0.0, [Intake] CAIAC Lead Capture v2.0.0

### [Utility] CRM Create Lead v1.0.0
- **ID**: `g7Gbsift1PZ085PH` | **Active**: true | **Tags**: NONE | **Updated**: 2026-06-20 | **versionCounter**: 3
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_id, crm_type, lead_name, lead_email, lead_phone, service, source_channel
- **Outputs**: `{ source_id, crm_type }` or `{ skipped: true }`
- **Nodes**: When Called as Sub-workflow → Check CRM Sync Feature (Postgres SELECT `caiac.client_features` WHERE feature='crm_sync'; returns true if no client_id) → CRM Sync Enabled? (IF) → [disabled]: Return CRM Skipped | [enabled]: Validate Inputs (Code: checks required fields + crm_type whitelist: pipedrive, housecall_pro) → Get CRM Config (Postgres SELECT from `caiac.client_crm_configs` with **pgp_sym_decrypt** to decrypt api_key, requires `CAIAC_ENCRYPTION_KEY` env var) → Check Config Found → Route by CRM Type (Switch: pipedrive | housecall_pro)
  - **Pipedrive path**: Pipedrive - Prepare → Create Person (POST `api.pipedrive.com/v1/persons`, Bearer auth from decrypted key) → Prepare Deal → Create Deal (POST `api.pipedrive.com/v1/deals`) → Format Output (`{ source_id: deal.id, crm_type: 'pipedrive' }`)
  - **HCP path**: HCP - Prepare → Create Customer (POST `api.housecallpro.com/customers`, Token auth) → Prepare Job → Create Job (POST `api.housecallpro.com/jobs`) → Format Output (`{ source_id: job.id, crm_type: 'housecall_pro' }`)
- **References caiac.client_features**: YES — `feature = 'crm_sync'`
- **References caiac.client_crm_configs**: YES — reads with pgcrypto decryption
- **DB**: Reads `caiac.client_features`, `caiac.client_crm_configs`
- **External**: Pipedrive API or HousecallPro API (key from decrypted DB column)
- **errorWorkflow**: Handle Workflow Error
- **Called by**: [Intake] Lead Capture v1.0.0

### [Utility] Get Client Review Config v1.0.0
- **ID**: `D7eHaKwQCqYLbjlh` | **Active**: true | **Tags**: utility, reviews | **Updated**: 2026-06-19 | **versionCounter**: 3
- **Trigger**: executeWorkflowTrigger
- **Inputs**: client_slug (optional), source_type (optional filter)
- **Nodes**: When Called as Sub-workflow → Query Client Review Config (Postgres SELECT `caiac.client_review_config` JOIN `caiac.clients` for client_name WHERE active=true AND optional slug/source_type filters)
- **⚠️ FLAG**: Reads from `caiac.client_review_config` but [Onboarding] Create Client Lead Sheet writes to `caiac.client_platform_config`. Table name discrepancy.
- **DB**: Reads `caiac.client_review_config`, `caiac.clients`
- **Called by**: [Reviews] Check Review Link Health, [Reviews] Poll Sheets For Completed Leads, [Reviews] Process Completed Lead, [Reviews] Handle Rating Click

### [Utility] Sign Review Token v1.0.0
- **ID**: `O60CFCYZdAGLXZkW` | **Active**: true | **Tags**: utility, reviews | **Updated**: 2026-06-19 | **versionCounter**: 3
- **Trigger**: executeWorkflowTrigger
- **Inputs**: action ('sign'|'verify'), client_slug, source_type, source_ref, secret, [token, payload_b64 for verify]
- **Nodes**: When Called as Sub-workflow → Sign Or Verify Token (Code: uses Node.js `crypto` module HMAC-SHA256; sign: builds payload `{slug}:{source_type}:{source_ref}:{expiry}`, base64url-encodes, returns `{ token, payload_b64 }`; verify: decodes, checks expiry, timing-safe equal comparison, returns `{ valid, client_slug, source_type, source_ref }`)
- **Note**: Token valid for 30 days from signing. Uses `crypto.timingSafeEqual` to prevent timing attacks.
- **DB**: None
- **Called by**: [Reviews] Process Completed Lead (sign), [Reviews] Handle Rating Click (verify)

### [Utility] Record Rating v1.0.0
- **ID**: `eQeYbCkCLYaNvG83` | **Active**: true | **Tags**: utility, reviews | **Updated**: 2026-06-19 | **versionCounter**: 7
- **Trigger**: executeWorkflowTrigger
- **Inputs**: source_type ('sheet'|'crm'), source_ref, lead_sheet_id, lead_sheet_tab, fields
- **Nodes**: When Called as Sub-workflow → Route By Source Type (IF source_type='sheet') → [sheet]: Prepare Sheet Update Inputs (Code: detects match_column by whether source_ref contains '@' — email vs phone) → Call Update Lead Sheet Row (executeWorkflow → [Utility] Update Lead Sheet Row) | [crm]: Throw CRM Not Implemented (Code: throws error "not yet implemented")
- **Note**: CRM write-back is a seam for future integration — intentionally throws until implemented.
- **Calls**: [Utility] Update Lead Sheet Row v1.0.0 (for sheet path)
- **Called by**: [Reviews] Handle Rating Click

### [Utility] Mark Review Sent v1.0.0
- **ID**: `zHqk2CNsXQX6K1Bn` | **Active**: true | **Tags**: utility, reviews | **Updated**: 2026-06-19 | **versionCounter**: 7
- **Trigger**: executeWorkflowTrigger
- **Inputs**: source_type, source_ref, lead_sheet_id, lead_sheet_tab, fields (`{ 'Review Email Sent': 'TRUE', 'Review Email Sent Date': today }`)
- **Nodes**: When Called as Sub-workflow → Route By Source Type (IF source_type='sheet') → [sheet]: Prepare Sheet Update Inputs → Call Update Lead Sheet Row | [crm]: Throw CRM Not Implemented
- **Note**: Structurally identical to [Utility] Record Rating v1.0.0 — same pattern, different caller context (marks sent vs records rating).
- **Calls**: [Utility] Update Lead Sheet Row v1.0.0
- **Called by**: [Reviews] Process Completed Lead

### [Utility] Update Lead Sheet Row v1.0.0
- **ID**: `ySf9npJlqi23yjXK` | **Active**: true | **Tags**: utility | **Updated**: 2026-06-19 | **versionCounter**: 7
- **Trigger**: executeWorkflowTrigger
- **Inputs**: lead_sheet_id, lead_sheet_tab, match_column ('Lead Email' or 'Lead Phone'), match_value, fields (object)
- **Nodes**: When Called as Sub-workflow → Flatten Fields For Mapping (Code: merges match_column+value with fields object) → Route By Match Column (IF match_column='Lead Email') → [email]: Upsert By Email (Google Sheets `appendOrUpdate`, matchingColumns=['Lead Email']) | [phone]: Upsert By Phone (Google Sheets `appendOrUpdate`, matchingColumns=['Lead Phone'])
- **External**: Google Sheets (credential: "Caiac Group Sheets")
- **Called by**: [Utility] Record Rating, [Utility] Mark Review Sent

### [Client] Public Config v1.0.0
- **ID**: `eKe1UmMNCOsLp4vz` | **Active**: true | **Tags**: client | **Updated**: 2026-06-20
- **Trigger**: GET webhook `/caiac/public/client-config?slug={slug}` (intentionally public — no auth)
- **Nodes**: Webhook → Validate Slug (Code: lowercase alphanumeric + hyphen only) → Slug Valid? (IF) → [invalid]: 400 | [valid]: Postgres Lookup (SELECT from `caiac.clients` + `json_object_agg(feature, enabled)` from `caiac.client_features` WHERE slug AND active) → Check Found (IF) → [not found]: 404 | [found]: Build Public Config (Code: strips secrets — removes webhook_secret, jwt_secret, ai.system_prompt, ai.ollama_url, ai.qdrant_url, permissions; returns branding, features, quick_actions, workflows, stats) → Send Public Config (200)
- **References caiac.client_features**: YES — aggregates all features for slug
- **Note**: Only webhook with no auth. Intentional design for client-side config discovery.
- **DB**: Reads `caiac.clients`, `caiac.client_features`

---

## Maintenance Workflows

### CAIAC Maintenance - Nightly Cleanup v1.0.0
- **ID**: `FpYhLFjFD0xpSfNf` | **Active**: true | **Tags**: maintenance | **Updated**: 2026-06-19 | **versionCounter**: 44
- **Trigger**: Schedule — daily at 3:00 AM; also executeWorkflowTrigger (can be invoked manually)
- **Nodes**: Nightly Trigger → Delete Expired Sessions (Postgres DELETE FROM `caiac.sessions` WHERE expires_at < NOW() RETURNING id) → Get 90 Day Cutoff (Code: computes ISO timestamp 90 days ago; captures sessions_deleted count) → Get Active Clients (Postgres SELECT id, slug, `config->>'ai'` FROM `caiac.clients` WHERE active) → Delete Old History Per Client (Code: for each client, reads `ai.qdrant_url` and `ai.qdrant_collection` from config, fans out items with cutoff) → Delete History Points (POST Qdrant `/collections/{collection}/points/delete`, filter type=chat_history AND timestamp < cutoff) → Log Cleanup (Postgres INSERT INTO `caiac.audit_log` action='cleanup' with cutoff — **hardcoded UUIDs**: client_id=`52161064-08e9-41bf-9512-84178dafad86`, user_id=`adf79801-d6e7-4255-be5e-045aa2ca4d2d`)
- **⚠️ FLAG**: `Log Cleanup` hardcodes specific UUIDs for client_id and user_id in audit_log. Breaks if those records are deleted.
- **⚠️ FLAG**: Reads `ai.qdrant_url` from client config for each client. If null/empty, the Qdrant DELETE URL becomes malformed. Production clients should all have this set.
- **DB**: Reads `caiac.clients`; deletes `caiac.sessions`; writes `caiac.audit_log`
- **External**: Qdrant (delete by timestamp filter, per client)

---

## Deprecated / Demo / Abandoned

### CAIAC Demo - Lead Capture v1.2.0
- **ID**: `Z6hV4ALmmPL4IdAr` | **Active**: true | **Tags**: onboarding, intake | **Updated**: 2026-06-19 | **versionCounter**: 10
- **Trigger**: POST webhook `/caiac/demo/lead?slug={slug}` (no auth — open webhook)
- **Nodes**: Receive Lead Form → Get Client Config (Postgres SELECT from `caiac.clients` WHERE slug, reads lead_capture config) → Extract Lead Data (Code: parses Typeform fields) → AI Score and Draft (POST `https://api.anthropic.com/v1/messages` directly, **model=claude-sonnet-4-5** — older model) → Parse AI Response → Send Follow-up Email (POST **SendGrid directly**, not via [Utility] Send Email) → Notify Owner (POST **SendGrid directly**) → Prepare Usage Log → Log Usage to Postgres (INSERT `caiac.ai_usage_log`) → Append row in sheet (Google Sheets `append`, credential: "Caiac Group Sheets")
- **⚠️ FLAG**: Uses `claude-sonnet-4-5` (not current `claude-sonnet-4-6`). Calls SendGrid directly (bypassing [Utility] Send Email abstraction). No `caiac.leads` DB tracking, no dedup, no automation_runs. No webhook authentication. Legacy demo workflow predating the v2.0.0 intake system.
- **⚠️ FLAG**: Still active and on a real webhook path — unclear if it receives production traffic or is purely demo.
- **DB**: Reads `caiac.clients`; writes `caiac.ai_usage_log`
- **External**: Anthropic API (direct), SendGrid API (direct), Google Sheets

### test
- **ID**: `xxV7VCASu8ySB7YG` | **Active**: false | **isArchived**: true | **Tags**: NONE | **Updated**: 2026-06-19 | **versionCounter**: 3
- **Trigger**: Manual trigger (When clicking 'Execute workflow')
- **Nodes**: Manual Trigger → Code in JavaScript (tests crypto module availability: `typeof require`, `typeof crypto.subtle`, `typeof TextEncoder`)
- **Purpose**: Sandbox test for checking n8n sandbox crypto availability. Archived.
- **No DB, no external services.**

---

## Sub-workflow Call Graph

```
[Onboarding] CAIAC Client Agent
  ├── [Onboarding] Create Client Record v1.0.0
  ├── [Onboarding] Seed Client Features v1.0.0
  ├── [Onboarding] Create Client User v1.0.0
  ├── [Onboarding] Create Lead Sheet v1.0.0
  ├── [Onboarding] Stub CRM Config v1.0.0
  ├── [Onboarding] Send Welcome Email v1.0.0
  │     └── [Utility] Send Email v1.0.0
  └── [Onboarding] Smoke Test v1.0.0

[Reviews] Poll Sheets For Completed Leads
  ├── [Utility] Get Client Review Config v1.0.0
  └── [Reviews] Process Completed Lead v1.0.0
        ├── [Utility] Get Client Review Config v1.0.0
        ├── [Utility] Sign Review Token v1.0.0
        ├── [Utility] Send Email v1.0.0
        └── [Utility] Mark Review Sent v1.0.0
              └── [Utility] Update Lead Sheet Row v1.0.0

[Reviews] Check Review Link Health
  ├── [Utility] Get Client Review Config v1.0.0
  └── [Utility] Send Email v1.0.0

[Reviews] Handle Rating Click
  ├── [Utility] Get Client Review Config v1.0.0
  ├── [Utility] Sign Review Token v1.0.0
  ├── [Utility] Record Rating v1.0.0
  │     └── [Utility] Update Lead Sheet Row v1.0.0
  └── [Utility] Send Email v1.0.0

[Intake] Lead Capture v1.0.0 / [Intake] CAIAC Lead Capture v2.0.0
  ├── [Utility] Score Lead v1.0.0  (→ Anthropic API)
  ├── [Utility] CRM Create Lead v1.0.0  (→ Pipedrive / HousecallPro)
  └── [Utility] Send Email v1.0.0

[Utility] Handle Workflow Error
  └── [Utility] Send Email v1.0.0

All webhook workflows → [Utility] Full Auth v2.0.0
  (→ hmac-verifier:3000, caiac_api.py /jwt/verify-with-lookup)
```

---

## Postgres Table Reference

| Table | Read by | Written by |
|-------|---------|-----------|
| caiac.clients | Full Auth, Signin, Refresh, Signout, Change Password, all RAG endpoints, Ingest Document, Delete Document, List Clients, List Documents, Client Health Check, Eval Status, Public Config, all Intake, Nightly Cleanup | Create Client Record (onboarding), Create Lead Sheet (onboarding) |
| caiac.users | Full Auth, Signin, Change Password, Smoke Test | Create Client User (onboarding), Change Password |
| caiac.client_features | Full Auth, Public Config, Handle Rating Click, Process Completed Lead, Score Lead, CRM Create Lead, CAIAC Lead Capture v2 | Toggle Client Feature, Seed Client Features |
| caiac.client_crm_configs | CRM Create Lead (with pgcrypto) | Stub CRM Config |
| caiac.documents | List Client Documents | Ingest Document (insert), Delete Document (soft-delete) |
| caiac.audit_log | — | Chat v2.4.1, Chat v2.5.0, Promote, Refresh, Signout, Ragas Eval, Nightly Cleanup |
| caiac.error_log | — | Handle Workflow Error, Lead Capture v1.0.0, CAIAC Lead Capture v2.0.0 |
| caiac.leads | Lead Capture v1.0.0, CAIAC Lead Capture v2.0.0 (check existing) | Lead Capture v1.0.0, CAIAC Lead Capture v2.0.0 |
| caiac.automation_runs | — | Lead Capture v1.0.0, CAIAC Lead Capture v2.0.0 |
| caiac.ai_usage_log | — | Lead Capture v1.0.0, CAIAC Lead Capture v2.0.0, Demo Lead Capture |
| caiac.eval_jobs | Eval Status | Run Ragas Eval |
| caiac.sessions | — | Nightly Cleanup (DELETE expired) |
| caiac.role_hierarchy | Chat v2.5.0 | — |
| caiac.client_review_config | Get Client Review Config | — |
| caiac.client_platform_config | — | Create Client Lead Sheet (onboarding) |

---

*End of inventory — 52 workflows total.*
