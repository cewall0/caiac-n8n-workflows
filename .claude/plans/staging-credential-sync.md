# Staging Credential Sync + Test Suite Setup

**Status: COMPLETE — 2026-06-26**
**Goal:** Sync staging credentials to match prod, then scaffold a Vitest integration test suite against staging.

---

## Context

Staging (`flows-staging.caiacdigital.com`) is missing 9 of the 13 credentials that prod has. This blocks workflow deploys from staging and prevents running a meaningful test suite against staging. Both environments share the same Postgres DB.

Credential gap as of 2026-06-25:

| Credential Name | Type | Gap |
|---|---|---|
| `Anthropic API` | `anthropicApi` | Missing in staging (staging has `Anthropic API Key` as httpHeaderAuth instead) |
| `JWT Auth account` | `jwtAuth` | Missing in staging |
| `Ollama account` | `ollamaApi` | Missing in staging |
| `SendGrid API` | `httpHeaderAuth` | Missing in staging |
| `SMTP account` | `smtp` | Missing in staging |
| `Gmail account` | `gmailOAuth2` | Missing in staging — requires OAuth flow |
| `Google account` | `googleOAuth2Api` | Missing in staging — requires OAuth flow |
| `Google Sheets account` | `googleSheetsOAuth2Api` | Missing in staging — requires OAuth flow |
| `Caiac Group Sheets` | `googleSheetsOAuth2Api` | Missing in staging — requires OAuth flow |
| `CAIAC Google Sheets SA` | `googleApi` | Missing in staging — needs service account JSON |
| `Webhook Header Auth` | `httpHeaderAuth` | In staging only, not in prod — add to prod |

---

## Phase 1 — Create Non-OAuth Credential Shells in Staging

Claude creates the credential entries in staging (they will show as invalid until values are filled in). Chad/user then fills in actual secret values via the n8n UI.

- [x] Create `Anthropic API` (type: `anthropicApi`) in staging
- [x] Create `JWT Auth account` (type: `jwtAuth`) in staging
- [x] Create `Ollama account` (type: `ollamaApi`) in staging — baseUrl: `http://ollama:11434`
- [x] Create `SendGrid API` (type: `httpHeaderAuth`) in staging
- [x] Create `SMTP account` (type: `smtp`) in staging

**Secrets needed from Chad:**
- Anthropic API key (same as prod)
- JWT secret (same secret as prod — must match or tokens issued in staging will be invalid in prod)
- Ollama host URL
- SendGrid API key
- SMTP host, port, username, password

---

## Phase 2 — OAuth Flows (Chad completes in staging UI)

These cannot be created via MCP — they require an interactive OAuth consent screen. Chad logs into `flows-staging.caiacdigital.com` and connects:

- [x] `Gmail account` — gmailOAuth2 — connected 2026-06-26
- [x] `Google account` — googleOAuth2Api — connected 2026-06-26 (unused by any active workflow)
- [x] `Google Sheets account` — googleSheetsOAuth2Api — connected 2026-06-26 (unused by any active workflow)
- [x] `Caiac Group Sheets` — googleSheetsOAuth2Api — connected 2026-06-26; requires custom OAuth client (GCP client `91202...`) with staging redirect URI added
- [ ] `CAIAC Google Sheets SA` — googleApi — skipped; unused by any active workflow in prod

---

## Phase 3 — Fix Prod Webhook Auth Credential

Staging has `Webhook Header Auth` but prod does not. This name mismatch will break any workflow that references it when deployed prod → staging or vice versa.

- [ ] Confirm: does prod use a different name for webhook header auth, or is this credential simply absent?
- [ ] Add `Webhook Header Auth` to prod (or rename staging to match prod's name)

**Note:** Prod confirmed has no `Webhook Header Auth` — staging-only. Low priority since no prod workflows reference it.

---

## Phase 4 — Scaffold Test Suite

Once staging has full credential parity:

- [ ] Create `tests/` directory with Vitest config
- [ ] Add `package.json` with Vitest + dotenv
- [ ] Create `tests/helpers/http.ts` — thin wrapper for calling staging webhook URLs with auth header
- [ ] Create `tests/helpers/db.ts` — direct Postgres query helper for asserting side effects
- [ ] Create `tests/fixtures/` — sample payloads per workflow (lead capture, auth, chat)
- [ ] Write first test: `tests/workflows/lead-capture.test.ts`
  - POST to `/caiac/lead` with a test payload
  - Assert 200 + expected response shape
  - Query DB to verify `leads` row was inserted
  - Clean up test row after
- [ ] Write `tests/workflows/auth.test.ts` — sign-in → refresh → sign-out flow
- [ ] Write smoke tests for prod (`tests/smoke/`) — HTTP ping only, no DB assertions, no data written

**Test client in staging DB:**
- Insert a `test` client row in the `clients` table (or equivalent) with `client_slug = 'caiac-test'`
- All integration tests run under this slug
- Add test inbox routing: notifications triggered by `caiac-test` route to a test email (to be decided)

---

## Notes

- Staging and prod share the same Postgres DB — test writes are real writes. Use a dedicated test client slug and clean up after each test.
- JWT secret **must match** between staging and prod if you want tokens to be cross-environment valid. Confirm this with Chad before creating the staging JWT credential.
- New workflows: build + test on staging first → deploy to prod → run smoke tests.
