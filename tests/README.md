# CAIAC Integration Test Suite

Integration tests for n8n workflows. Tests run against **staging** (`flows-staging.caiacdigital.com`) by default and make real HTTP calls + real DB assertions.

---

## Setup

```bash
cp .env.test.example .env.test
# Fill in the values below, then:
npm install
```

**Required `.env.test` values before running:**

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string — `postgresql://caiac:<password>@<host>:5432/caiac` |
| `WEBHOOK_HEADER_KEY` | Value of the `x-webhook-key` header required by all webhook triggers |
| `TEST_USER_EMAIL` | `test@caiacdigital.com` (already created under henderson) |
| `TEST_USER_PASSWORD` | `CaiacTest2026!` |

**Optional — enables more tests:**

| Variable | Unlocks |
|---|---|
| `CAIAC_STAFF_EMAIL` / `CAIAC_STAFF_PASSWORD` | Content-level document permission tests (ingest/delete) |
| `TEST_USER_STAFF_EMAIL` / `TEST_USER_STAFF_PASSWORD` | Role-based chat + permission tests for staff tier |
| `TEST_USER_ADMIN_EMAIL` / `TEST_USER_ADMIN_PASSWORD` | Role-based tests for admin tier |
| `TEST_USER_OWNER_EMAIL` / `TEST_USER_OWNER_PASSWORD` | Role-based tests for owner tier |

Tests that need unconfigured credentials skip with `console.warn` — they don't fail the suite.

---

## Running Tests

```bash
# Run everything (staging)
npm test

# Watch mode — re-runs on file save, useful during development
npm run test:watch

# Run a single test file
npx vitest run tests/workflows/auth.test.ts

# Run all tests matching a pattern
npx vitest run --reporter=verbose auth

# Smoke tests only (prod-safe, no DB writes)
npm run test:smoke

# Run smoke tests against prod
N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npm run test:smoke
```

Tests run against **staging** (`flows-staging.caiacdigital.com`) by default. To point at prod:
```bash
N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npm test
```

---

## File Structure

```
tests/
  helpers/
    http.ts       # HTTP client — fetch wrapper, getToken() JWT helper, query param support
    db.ts         # Postgres helper — query/queryOne for side-effect assertions
  fixtures/
    lead-capture.ts   # Sample lead payloads (uses henderson slug, example.invalid emails)
    auth.ts           # Test credentials
  workflows/
    lead-capture.test.ts          # [Intake] CAIAC Lead Capture v2.0.0/v2.1.0
    auth.test.ts                  # Auth signin / refresh / signout flow
    auth-change-password.test.ts  # Auth change password — rejection paths only
    public-config.test.ts         # [Client] Public Config v1.0.0
    chat-gateway.test.ts          # [Chat] Public Gateway v1.0.0
    chat-v26.test.ts              # CAIAC RAG - Chat v2.6.0 (staging path)
    admin-health.test.ts          # [Admin] Client Health Check
    admin-clients.test.ts         # [Admin] List Clients
    admin-documents.test.ts       # [Admin] List Client Documents
    document-permissions.test.ts  # Role hierarchy, content-level RAG filter (seeds/tears down test docs)
    chat-history.test.ts          # Chat History / Messages / Delete
    promote-dismiss.test.ts       # Promote + Dismiss (token in body)
    ops-health.test.ts            # CAIAC Admin Health — staff only
    admin-toggle-feature.test.ts  # [Admin] Toggle Client Feature — staff only
    admin-update-config.test.ts   # [Admin] Update Client Config — staff only
    admin-ingest-preview.test.ts  # [Admin] Ingest Preview — staff only, synchronous
    reviews-rating-click.test.ts  # [Reviews] Handle Rating Click — HMAC rejection paths
  smoke/
    endpoints.test.ts # Pings all known endpoints — HTTP only, no DB writes
  setup.ts          # Global setup — loads .env.test, closes DB pool after all tests
```

---

## Coverage

| Workflow | Test file | Notes |
|---|---|---|
| `[Intake] CAIAC Lead Capture v2.0.0` | `lead-capture.test.ts` | Happy path, edge cases, DB assertion |
| `CAIAC Auth - Signin v2.0.0` | `auth.test.ts` | Valid, invalid, full refresh→signout flow |
| `CAIAC Auth - Refresh v2.0.0` | `auth.test.ts` | Covered as part of flow |
| `CAIAC Auth - Signout v1.0.0` | `auth.test.ts` | Covered as part of flow |
| `CAIAC Auth - Change Password v1.0.0` | `auth-change-password.test.ts` | Rejection paths only — no success test (would change real password) |
| `[Client] Public Config v1.0.0` | `public-config.test.ts` | Valid slug, missing slug, unknown slug |
| `[Chat] Public Gateway v1.0.0` | `chat-gateway.test.ts` | Valid, missing fields, unknown slug |
| `CAIAC RAG - Chat v2.6.0` | `chat-v26.test.ts` | Auth-protected, valid message, missing token, missing fields; cap enforcement: Ollama fallback on cap hit (no request_count increment), Claude routing increments request_count |
| `[Admin] Client Health Check` | `admin-health.test.ts` | Valid slug, auth guard |
| `[Admin] List Clients` | `admin-clients.test.ts` | Returns array, henderson present, auth guard |
| `[Admin] List Client Documents` | `admin-documents.test.ts` | Valid slug, auth guard, missing slug |
| Role hierarchy + document permissions | `document-permissions.test.ts` | DB role hierarchy, chat access by role, admin endpoint guards, content-level RAG filter (seeds + tears down test docs) |
| `CAIAC RAG - Chat History v1.0.0` | `chat-history.test.ts` | Session list, auth guard, seeded session appears |
| `CAIAC RAG - Chat Messages v1.0.0` | `chat-history.test.ts` | Messages for session, empty on unknown, auth guard |
| `CAIAC RAG - Chat Delete v1.0.0` | `chat-history.test.ts` | Deletes seeded session, verifies absent from history |
| `CAIAC RAG - Promote v1.0.0` | `promote-dismiss.test.ts` | Client role blocked, missing fields, happy-path needs `TEST_USER_STAFF_EMAIL` + `TEST_HISTORY_SESSION_ID` |
| `CAIAC RAG - Dismiss v1.0.0` | `promote-dismiss.test.ts` | Same as promote |
| `CAIAC Admin Health v1.0.0` | `ops-health.test.ts` | Auth guard, services map shape, postgres + qdrant up |
| `[Admin] Toggle Client Feature v1.0.0` | `admin-toggle-feature.test.ts` | Auth guard, unknown feature, missing fields, idempotent set (needs `CAIAC_STAFF_EMAIL`) |
| `[Admin] Update Client Config v1.0.0` | `admin-update-config.test.ts` | Auth guard, missing slug, unknown client, field update + restore (needs `CAIAC_STAFF_EMAIL`) |
| `[Admin] Ingest Preview v1.0.0` | `admin-ingest-preview.test.ts` | Auth guard, missing fields, valid `.txt` → chunks array (needs `CAIAC_STAFF_EMAIL`) |
| `[Reviews] Handle Rating Click v1.0.0` | `reviews-rating-click.test.ts` | Rejection/validation paths only — missing params, invalid HMAC, malformed payload. Run against prod (no staging deploy) |
| `[Admin] Update Feature Config v1.0.0` | `admin-update-feature-config.test.ts` | Auth guard, unknown feature 400, DB assertion for cap write, afterAll restores cap |
| `[Admin] Get Client Errors v1.0.0` | `admin-client-errors.test.ts` | Auth guard, missing slug, errors array shape, limit param respected |
| `[Admin] Platform Overview v1.0.0` | `admin-platform-overview.test.ts` | Auth guard, client JWT rejected (cross-client), all stat chip fields present + non-negative |
| `[Admin] Manage Client User v1.0.0` | `admin-manage-client-user.test.ts` | Auth guard, action validation, list shape (no password_hash), deactivate/activate/force-pw DB assertion, cross-client isolation |
| `[Admin] Get Client Analytics v1.0.0` | `admin-client-analytics.test.ts` | Auth guard, shape validation, funnel monotonicity, months clamping. Exact values need analytics seed fixture (Phase T8) |
| `[Admin] Get Client Config v1.0.0` | `admin-client-config.test.ts` | Auth guard, missing/unknown slug, features array shape, config object shape, chat feature always enabled |
| `[Admin] Get/Update Client Platform Config v1.0.0` | `admin-client-platform-config.test.ts` | Auth guard, GET returns review_notify_email (not client_admin_email), POST updates google/facebook link + DB assertion, link_signing_secret not writable, restore in afterAll |
| `[Client] Get AI Usage v1.0.0` | `client-ai-usage.test.ts` | Auth guard, response shape (200 or 404), slug override ignored (security) |
| `[Admin] Delete Leads v1.0.0` | `tests/smoke/endpoints.test.ts` (smoke only) | Auth guard only — no deletion test in suite. Manual trigger lane in n8n for test data cleanup |
| Smoke suite — all active endpoints | `tests/smoke/endpoints.test.ts` | HTTP only, no DB writes. Run post-deploy: `npm run test:smoke` |
| Onboarding workflows | — | Deferred — needs fake client provisioning/teardown strategy |

---

## When to Add or Update Tests

| Change | What to do |
|---|---|
| New workflow deployed to staging | Add `tests/workflows/<name>.test.ts` |
| Existing workflow changes its response shape | Update the matching test file |
| New webhook path added | Add fixture + test; update http helper if auth pattern differs |
| Workflow version bump (e.g. v2.0.0 → v2.1.0) | Update the test file; note the new version in a comment at the top |
| Workflow deployed to prod | Add a smoke test in `tests/smoke/` — HTTP ping + assert 200 |
| Tally form type added | Add fixture payload + route assertion to `tests/workflows/tally-router.test.ts` |

**Rule:** every workflow in the registry with status `active` or `staging` should have a corresponding test file before it ships to prod.

---

## Test Client

All tests run under `client_slug = henderson`. Henderson is the designated test client — it already exists in the DB and is safe to run against.

- Tests that write leads clean up after themselves (`afterEach` deletes rows with `source = 'test-suite'`)
- Auth tests use a dedicated test user (`TEST_USER_EMAIL = test@caiacdigital.com`) — this user is safe to modify
- Role-based tests require `TEST_USER_STAFF_EMAIL`, `TEST_USER_ADMIN_EMAIL`, `TEST_USER_OWNER_EMAIL` to be set in `.env.test`; unconfigured roles skip with a `console.warn`

---

## Smoke Tests (`tests/smoke/`)

Smoke tests are prod-safe: HTTP only, no DB writes, no side effects. Run them after a prod deploy to verify the endpoint is up and returns a sane response.

```bash
N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npm run test:smoke
```
