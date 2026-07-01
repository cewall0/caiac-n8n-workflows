# Admin Dashboard Sprint

Execute or report on a phase of the admin client config panel sprint.

**Usage:** `/admin-sprint` — print current phase status and what's ready to run  
**Usage:** `/admin-sprint phase-0` — execute Phase 0 (DB cleanup)  
**Usage:** `/admin-sprint phase-1` — execute Phase 1 (cap fix + Get AI Usage fix)  
**Usage:** `/admin-sprint phase-T` — execute Phase T (test infrastructure setup)  
**Usage:** `/admin-sprint phase-2` — execute Phase 2 (new n8n workflows)  
**Usage:** `/admin-sprint phase-3` — execute Phase 3 (ops dashboard components)  
**Usage:** `/admin-sprint phase-4` — execute Phase 4 (client dashboard)  
**Usage:** `/admin-sprint preflight` — run all pre-flight DB queries without changing anything  

---

## Plan Reference

The full build order with exact step numbers, SQL, and test file names lives at:
`.claude/plans/admin-client-config-panel.md`

**Always read the plan before executing any phase.** Step numbers, SQL, and workflow IDs in this skill are secondary to the plan — if they diverge, the plan wins.

---

## Status Report (no argument)

When run with no argument:

1. Read `.claude/plans/admin-client-config-panel.md`
2. Read `OPEN_ITEMS.md` for any current blockers
3. For each phase (0, 1, T, 2, 3, 4), report:
   - **Blocked** — what's preventing it from starting (from OPEN_ITEMS or plan prerequisites)
   - **Ready** — all prerequisites met, can execute now
   - **In progress** — partially done (check plan for completed-step markers)
   - **Done** — all steps complete

Print a compact table:

```
ADMIN DASHBOARD SPRINT — status (YYYY-MM-DD)

Phase 0  DB Cleanup             BLOCKED — Handle Rating Click staging version needed (OPEN_ITEMS)
Phase 1  Cap Fix                READY   — run preflight first to verify no custom caps
Phase T  Test Infrastructure    READY   — need OPS_DASHBOARD_URL + CLIENT_DASHBOARD_URL for .env.test
Phase 2  New Workflows          BLOCKED — requires Phase 0 + Phase T complete
Phase 3  Ops Dashboard          BLOCKED — requires Phase 2 complete
Phase 4  Client Dashboard       BLOCKED — requires Phase 3 complete

Run /admin-sprint preflight to check DB state before Phase 1.
Run /admin-sprint phase-1 to start Phase 1.
```

---

## Pre-flight Checks (`preflight`)

Run these read-only DB queries via a temp workflow on staging. Print results for each.

### Check 1 — Any non-default AI caps set?

```sql
SELECT c.slug, cf.config
FROM caiac.client_features cf
JOIN caiac.clients c ON c.id = cf.client_id
WHERE cf.feature = 'advanced_ai'
  AND cf.config IS NOT NULL
  AND cf.config != '{}'
ORDER BY c.slug;
```

**Pass:** zero rows → safe to deploy Phase 1 cap fix without touching any client  
**Fail:** rows exist → review each `config` value before Phase 1; if they contain `cap`, the fix will start reading them (likely desired, but verify first)

### Check 2 — `client_admin_email` column exists?

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'caiac'
  AND table_name = 'client_platform_config'
  AND column_name IN ('client_admin_email', 'review_notify_email');
```

**Pass for Phase 0 step 1:** `client_admin_email` present, `review_notify_email` absent → migration not yet run  
**Pass for Phase 0 step 2+:** `review_notify_email` present → column already renamed

### Check 3 — Handle Rating Click exists in staging?

Call `mcp__n8n__n8n_list_workflows` and search for a workflow named matching `Handle Rating Click`.

**Pass for Phase 0:** staging version exists and is active  
**Fail:** not found → Phase 0 steps 2–3 are blocked; add/confirm OPEN_ITEMS entry

### Check 4 — `automation_type` values in use?

```sql
SELECT DISTINCT automation_type, COUNT(*) as cnt
FROM caiac.automation_runs
GROUP BY automation_type
ORDER BY cnt DESC;
```

Print the full result. Needed to confirm the correct `automation_type` value for review requests before building the analytics query in Phase 2.

---

## Phase 0 — DB Cleanup

Read the full Phase 0 steps from the plan before executing. The plan is authoritative for exact SQL.

### Pre-flight gate
Run preflight Check 2 and Check 3 before any step. Abort and report if Handle Rating Click is not in staging.

### Execution order
Steps are **strictly sequential** — each step either deploys a workflow OR runs SQL, never both at the same time. The breaking-change window (migration 2: rename `client_admin_email`) should be done off-hours.

1. Read the plan Phase 0 steps in order
2. For SQL-only steps: create a temp workflow on staging (webhook trigger + Postgres node + RespondToWebhook), execute it, then delete the temp workflow
3. For workflow deploy steps: get the staging workflow JSON, deploy to prod (requires confirmation), update `workflows/README.md`
4. After all steps: run preflight Check 2 again to confirm column rename succeeded

**Temp workflow pattern:**
- Use `responseMode: "responseNode"` (not `lastNode`) when you need more than one row back
- Use a Code node to aggregate `$input.all()` into `{ json: { rows: items.map(i => i.json) } }` before RespondToWebhook

---

## Phase 1 — Cap Fix

### Pre-flight gate
Run preflight Check 1 first. If any client has a non-empty `config`, confirm with user before proceeding.

### Step 1 — Fix `[Admin] Get AI Usage v1.0.0`

Staging ID: `STsGoDCDUJhjBgEE`

Two bugs to fix in the `Query AI Usage` Postgres node:

**Bug 1** — replace `cf.metadata->>'cap'` with `cf.config->>'cap'`:
```sql
COALESCE((cf.config->>'cap')::int, 100) AS cap
```

**Bug 2** — replace the string-interpolated slug filter with a parameterized query:
```sql
-- Remove: {{ $json.slug ? "AND c.slug = '" + $json.slug + "'" : '' }}
-- Replace with: AND ($1::text IS NULL OR c.slug = $1)
-- Pass $json.slug as query parameter $1
```

After fixing: run `n8n_validate_workflow` on the updated workflow, then activate it in staging and test with a GET to `/admin/ai-usage`.

### Step 2 — Fix Chat v2.6.0 cap query

Staging ID: `kvu3hOiGTiuvbVlQ` — `Get Claude Cap` node

Replace hardcoded `SELECT 100 AS cap` with a real DB read:
```sql
SELECT
  COALESCE((cf.config->>'cap')::int, 100) AS cap,
  COALESCE(au.request_count, 0) AS request_count
FROM caiac.client_features cf
LEFT JOIN caiac.ai_usage au
  ON au.client_id = cf.client_id AND au.period = $2
WHERE cf.client_id = $1::uuid
  AND cf.feature = 'advanced_ai'
LIMIT 1
```

Parameters: `$1` = `{{ $('Full Auth').item.json.client_id }}`, `$2` = `{{ new Date().toISOString().slice(0,7) }}`

After fixing: validate workflow, test the cap path in staging by temporarily setting a low cap value for henderson.

### Step 3 — Update test coverage

Update `tests/workflows/chat-v26.test.ts` to add a cap enforcement test case (mocked cap via DB insert, verify 200 response routes to Ollama fallback).

---

## Phase T — Test Infrastructure

**All 11 steps can be executed by Claude without user involvement**, except:
- T1/T2 require the two staging dashboard URLs to be provided for `.env.test`
- T11 requires a DB write to create the test-only client (confirm before running)

Ask the user for `OPS_DASHBOARD_URL` and `CLIENT_DASHBOARD_URL` if not provided. Then execute T1–T11 in order. Read the plan for the exact file contents for each step.

Steps T1–T4: Playwright install + config files (both repos)  
Steps T5–T6: `.env.test.example` additions  
Step T7: `sign.ts` HMAC helper  
Step T8: Analytics fixture  
Step T9: Global teardown in `vitest.config.ts`  
Step T10: Nightly cleanup purge node  
Step T11: Seed test-only client  

---

## Phase 2 — New n8n Workflows

Read Phase 2 steps from the plan. For each workflow:

1. Build on staging using `mcp__n8n__n8n_create_workflow`
2. Validate with `n8n_validate_workflow`
3. Activate on staging
4. Write the test file (`tests/workflows/<name>.test.ts`)
5. Run the test: `npx vitest run tests/workflows/<name>.test.ts`
6. Only after tests pass: deploy to prod (requires confirmation)
7. Update `workflows/README.md` with the prod ID

**Security checklist before any Phase 2 workflow ships to prod** (from plan):
- Webhook uses Header Auth
- All SQL uses parameterized queries (no string interpolation)
- No secrets in workflow JSON
- `saveDataSuccessExecution: "none"` on any workflow touching PII
- Feature guard present for `advanced_ai` workflows

---

## Phase 3 — Ops Dashboard Components

Read Phase 3 steps from the plan. For each component:

1. Build the component in `caiac-ops-dashboard`
2. Write the Playwright spec (`e2e/<tab-name>.spec.ts`)
3. Run: `npx playwright test e2e/<tab-name>.spec.ts` against staging dashboard URL
4. Fix until green

The panel shell (slide-over) must be built first — all tab components depend on it.

---

## Phase 4 — Client Dashboard

Read Phase 4 steps from the plan. Primarily:
- `AIUsageBar` component showing current usage vs cap
- Fetches from `[Admin] Get AI Usage v1.0.0` (must be live from Phase 1)
- Playwright spec: `e2e/ai-usage-bar.spec.ts`

---

## Key Rules

- **Never edit prod directly** — always staging first, then deploy with confirmation
- **SQL must be parameterized** — no string interpolation in any Postgres node query
- **The plan is authoritative** — exact SQL, file names, and step details are in `.claude/plans/admin-client-config-panel.md`
- **`client_features.config`** — the JSONB column is `config`, never `metadata`
- **Temp workflows**: always delete after use. Use `responseMode: "responseNode"` + Code aggregator when you need multi-row results
- **Breaking change window** (Phase 0 migration 2): rename `client_admin_email → review_notify_email` must be done off-hours; deploy the updated Handle Rating Click workflow immediately after the SQL runs