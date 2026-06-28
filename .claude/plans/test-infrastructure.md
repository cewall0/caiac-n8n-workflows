# Test Infrastructure Plan

**Status: APPROVED — PENDING IMPLEMENTATION**
**Owner:** lukesgray
**Created:** 2026-06-28

Each phase is fully independent. Work them in any order. No phase blocks another.

---

## How to Trigger Claude Without Re-Explaining

| Say this | Claude does |
|---|---|
| `/run-tests` | Runs integration tests + reports pass/fail |
| `/run-tests smoke` | Runs smoke suite against prod (no creds needed) |
| `/update-tests [workflow name]` | Reads live workflow from n8n, diffs against test file, proposes edits |
| `add smoke test for [path]` | Adds one entry to `tests/smoke/endpoints.test.ts` |
| `create test file for [workflow name]` | Scaffolds a new `tests/workflows/` file based on live workflow |
| `add playwright spec for [feature] in [repo]` | Writes spec file in the correct frontend repo |

---

## Phase 0 — Fix Existing Test Issues
**Human work: 10 min | Claude work: done in session**

### What's broken today

| Test file | Problem | Fix |
|---|---|---|
| `chat-v26.test.ts` | Hardcoded `caiac/chat/v26-staging` — breaks on prod run | Make path read from `CHAT_PATH` env var |
| `chat-history.test.ts` | Same staging path hardcoded | Same fix |
| `document-permissions.test.ts` | Same staging path hardcoded | Same fix |
| `promote-dismiss.test.ts` | Happy-path skips unless `TEST_HISTORY_SESSION_ID` is manually set | Seed own session in `beforeAll` like `chat-history.test.ts` does |

### Human tasks
1. **Create `.env.test`** — copy from `.env.test.example` and fill in real values. This is a one-time step; once done you never touch it again unless credentials rotate.
   ```bash
   cp .env.test.example .env.test
   ```
   New variables to add to `.env.test` for this phase:
   ```
   CHAT_PATH=caiac/chat/v26
   CHAT_STAGING_PATH=caiac/chat/v26-staging
   ```
2. **Verify** by running `npm test` and checking the skipped vs passing count matches expectations.

### Claude tasks
- Fix all 4 files above
- Update `.env.test.example` with the two new vars
- Commit with message `fix: make chat path env-aware + self-seeding promote-dismiss`

### Trigger phrase
`implement phase 0 of the test infrastructure plan`

---

## Phase 1 — GitHub Actions Smoke CI
**Human work: 5 min | Claude work: 30 min**

Automatically runs 19 smoke tests on every push to `dev`. No credentials required. Green/red badge visible in GitHub. Alerts you when an endpoint goes 404/502 after a deploy.

### What it does
- Triggers on push to `dev`
- Runs `npm run test:smoke` against `https://flows.caiacdigital.com`
- Passes in ~5 seconds
- Fails + emails you if any endpoint returns 404 or 502

### Human tasks
1. After Claude commits the workflow file, push to GitHub. CI runs automatically on the next push.
2. **Optional — branch protection:** GitHub → repo Settings → Branches → Add rule for `main` → check "Require status checks to pass before merging" → select `smoke-test` from the dropdown. (The check only appears after CI has run at least once.)
3. **Optional — email alerts:** GitHub → Settings → Notifications → Actions → "Send email for failed workflows". This is on by default for repos you own.

### Claude tasks
- Create `.github/workflows/test-smoke.yml`
- Commit

### What the CI file looks like
```yaml
name: Smoke Tests
on:
  push:
    branches: [dev]
  workflow_dispatch:  # run manually from GitHub UI

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:smoke
        env:
          N8N_WEBHOOK_BASE: https://flows.caiacdigital.com
```

### Trigger phrase
`implement phase 1 of the test infrastructure plan`

---

## Phase 2 — New Integration Tests
**Human work: 0 (Claude writes all files) | Claude work: 2–3 hrs**

Four new test files for workflows that currently have no coverage. All follow the same pattern as existing tests: rejection paths run without creds, happy paths skip with `console.warn` if creds not set.

### New files

| File | Workflow | Rejection paths | Happy-path needs |
|---|---|---|---|
| `tests/workflows/public-chat.test.ts` | `[Chat] Public Gateway v1.0.0` | No slug, origin blocked, feature flag off | `TEST_USER_EMAIL` |
| `tests/workflows/admin-delete-leads.test.ts` | `[Admin] Delete Leads v1.0.0` | No auth, bad mode, missing slug | `CAIAC_STAFF_EMAIL` |
| `tests/workflows/sign-review-token.test.ts` | `[Utility] Sign Review Token v1.0.0` | No auth, missing fields, bad slug | `CAIAC_STAFF_EMAIL` + DB read |
| `tests/workflows/admin-delete-document.test.ts` | `[Admin] Delete Document v1.0.0` | No auth, unknown doc | `CAIAC_STAFF_EMAIL` (seeds then deletes) |

### Human tasks
1. Confirm the Public Gateway webhook path — check in n8n UI or ask Claude: `what webhook path does [Chat] Public Gateway v1.0.0 use?`
2. Confirm the Sign Review Token webhook path — same
3. Run `npm test` after Claude creates the files. Rejection-path tests should pass immediately. Happy-path tests skip if credentials not set.

### Claude tasks
- Create all 4 test files
- Add smoke test entries for `public/chat` and any new endpoints
- Update `tests/README.md` coverage table
- Commit

### Trigger phrase
`implement phase 2 of the test infrastructure plan`

---

## Phase 3 — Skills
**Human work: 0 | Claude work: 1 hr**

Two new slash commands that make test maintenance nearly hands-free.

### `/run-tests`

**Usage:**
```
/run-tests              → runs full integration suite
/run-tests smoke        → runs smoke suite against prod
/run-tests [filename]   → runs one test file
```

**What Claude does:**
1. Checks `.env.test` exists; if not, reminds you what to fill in
2. Runs the appropriate vitest command
3. Reports pass/fail count, lists failing test names with file:line links
4. If failures: reads the test output and proposes the most likely fix

### `/update-tests`

**Usage:**
```
/update-tests [workflow name]   → e.g. /update-tests "[Admin] Toggle Client Feature v1.0.0"
```

**What Claude does:**
1. Pulls the live workflow JSON from n8n via MCP
2. Reads the corresponding test file
3. Compares: request fields, response shape, status codes, edge cases
4. Shows a diff of what changed in the workflow
5. Proposes specific edits to the test file — you approve or skip each one

**When to use it:**
- Any time a workflow is updated in n8n
- After a version bump (e.g. v1 → v2)
- When a test starts failing after a prod deploy

### Human tasks
None. Skills work as soon as they're committed.

### Claude tasks
- Create `.claude/commands/run-tests.md`
- Create `.claude/commands/update-tests.md`
- Commit

### Trigger phrase
`implement phase 3 of the test infrastructure plan`

---

## Phase 4 — Playwright E2E Tests
**Human work: 30 min (install + config) | Claude work: 2 hrs (specs)**

Playwright tests live in the frontend repos. They test browser-rendered behavior that Vitest/HTTP can't cover: login flows, chat widget rendering, form submissions, dashboard state.

### Where tests live

```
caiac-client-dashboard/
  tests/e2e/
    auth.spec.ts          # Login, logout, expired token redirect
    chat.spec.ts          # Widget renders, send message, session persists
    history.spec.ts       # Session list, messages, delete
    lead-capture.spec.ts  # Public intake form submission

caiac-ops-dashboard/
  tests/e2e/
    clients.spec.ts       # List loads, search, click → config panel
    documents.spec.ts     # Upload, appears in list, delete
    feature-toggle.spec.ts # Toggle sends payload, state reflects

caiac-n8n-workflows/      (this repo)
  tests/e2e/
    review-rating.spec.ts # Good rating → redirect; bad → HTML page renders
```

### Human one-time setup (do in each frontend repo)

```bash
# In caiac-client-dashboard:
npm install -D @playwright/test
npx playwright install chromium

# In caiac-ops-dashboard:
npm install -D @playwright/test
npx playwright install chromium
```

Then add to each repo's `package.json`:
```json
"test:e2e": "playwright test"
```

Then in GitHub, add secrets to each frontend repo (Settings → Secrets → Actions):
| Secret | Value |
|---|---|
| `TEST_USER_EMAIL` | `test@caiacdigital.com` |
| `TEST_USER_PASSWORD` | `CaiacTest2026!` |

That's everything you need to do. Claude writes all the spec files and CI workflow.

### Claude tasks
- Create `playwright.config.ts` in each frontend repo
- Create all spec files listed above
- Create `.github/workflows/e2e.yml` in each frontend repo (triggers on PR to `main`)
- Commit to each repo

### CI behavior
- Runs on every PR to `main` (not on push to dev — too slow)
- Uses headless Chromium
- Fails the PR if any spec fails
- ~2 min total runtime

### Trigger phrase
`implement phase 4 of the test infrastructure plan`  
(specify which repo first: "implement phase 4 for caiac-client-dashboard")

---

## Quick Reference: Test Commands

```bash
# Integration tests (requires .env.test)
npm test
npm run test:watch
npx vitest run tests/workflows/auth.test.ts

# Smoke tests (no credentials needed)
npm run test:smoke
N8N_WEBHOOK_BASE=https://flows-staging.caiacdigital.com npm run test:smoke

# Type check
npm run typecheck

# Verbose output
npx vitest run --reporter=verbose
```

---

## Coverage Map — Current State

| Layer | Workflows | Test files | Status |
|---|---|---|---|
| Auth | Signin, Refresh, Signout, Change Password | `auth.test.ts`, `auth-change-password.test.ts` | ✅ Full coverage |
| Intake | Lead Capture v2.1.0 | `lead-capture.test.ts` | ✅ Full coverage |
| Chat — authenticated | Chat v2.6.0, History, Messages, Delete | `chat-v26.test.ts`, `chat-history.test.ts` | ✅ Needs path fix (Phase 0) |
| Chat — public gateway | Public Gateway v1.0.0 | — | ❌ Missing (Phase 2) |
| Chat — role permissions | role_hierarchy, content-level RAG | `document-permissions.test.ts` | ✅ Comprehensive |
| Promote / Dismiss | Promote, Dismiss | `promote-dismiss.test.ts` | ⚠️ Happy-path needs Phase 0 fix |
| Admin — config | Toggle Feature, Update Config, Ingest Preview | `admin-toggle-feature.test.ts`, `admin-update-config.test.ts`, `admin-ingest-preview.test.ts` | ✅ Full coverage |
| Admin — health / lists | Client Health, List Clients, List Documents | `admin-health.test.ts`, `admin-clients.test.ts`, `admin-documents.test.ts` | ✅ Full coverage |
| Admin — document ops | Ingest, Delete Document | `document-permissions.test.ts` (partial) | ⚠️ Delete missing (Phase 2) |
| Admin — data ops | Delete Leads | — | ❌ Missing (Phase 2) |
| Reviews — rating click | Handle Rating Click | `reviews-rating-click.test.ts` | ✅ HMAC paths covered |
| Reviews — token signing | Sign Review Token | — | ❌ Missing (Phase 2) |
| Ops health | Admin Health | `ops-health.test.ts` | ✅ Full coverage |
| Smoke — all endpoints | 19 endpoints | `tests/smoke/endpoints.test.ts` | ✅ Passes, CI pending (Phase 1) |
| E2E — dashboards | Client dashboard, ops dashboard | — | ❌ Missing (Phase 4) |

---

## Maintenance Protocol

### When a workflow is updated
1. Say `/update-tests [workflow name]` — Claude reads the live JSON and diffs vs the test
2. Approve or skip each proposed edit
3. Done — Claude commits

### When a new endpoint ships to prod
1. Say `add smoke test for [path]` — Claude adds one `it()` block
2. Done

### When a workflow is deployed for the first time
1. Say `create test file for [workflow name]` — Claude scaffolds the full test file
2. Add credentials to `.env.test` if the workflow needs auth
3. Run `npm test` — rejection paths should pass immediately

### When credentials rotate
1. Update `.env.test` only (it's gitignored)
2. No code changes needed
