# Run Tests

Run the CAIAC n8n integration test suite or smoke suite, report results, and learn from what you find.

**Usage:**
- `/run-tests` — full integration suite (requires `.env.test`)
- `/run-tests smoke` — smoke suite against prod (no credentials needed)
- `/run-tests [filename]` — single test file, e.g. `/run-tests auth`

---

## Steps

### 1. Parse args
- `smoke` → run smoke suite
- A partial filename (e.g. `auth`, `lead-capture`) → match `tests/workflows/*{arg}*.test.ts`
- No args → full integration suite

### 2. Check prerequisites

**For integration tests (non-smoke):**
- If `.env.test` missing: stop. Tell the user exactly what to fill in (read `.env.test.example` to show the variable list).
- If `node_modules/` missing: tell user to run `npm install`.

**For smoke:**
- No prerequisites.

### 3. Run via Bash

**Smoke:**
```bash
N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npx vitest run --config vitest.smoke.config.ts --reporter=verbose
```

**Single file:**
```bash
npx vitest run tests/workflows/[matched-file].test.ts --reporter=verbose
```

**Full suite:**
```bash
npx vitest run --reporter=verbose
```

Timeout: 120s for integration (LLM-backed tests are slow), 30s for smoke.

### 4. Report results

Extract from vitest output:
- Total: X passed / Y failed / Z skipped
- Failing test names + `file.test.ts:lineNumber`
- `console.warn` lines (intentional skips — show as "Skipped (no creds)")

**Format:**
```
## Results — [suite] — [timestamp]

✅ X passed   ❌ Y failed   ⏭ Z skipped

Failures:
  [test name] — tests/workflows/auth.test.ts:42
  AssertionError: expected 200 to equal 401

Credential skips:
  promote happy-path — CAIAC_STAFF_EMAIL not configured

Files:
  ✅ auth.test.ts (4/4)
  ❌ chat-v26.test.ts (2/4) — 2 path-related failures
```

### 5. Diagnose each failure

For each failure, reason about the cause:

| Symptom | Likely cause | Proposed fix |
|---|---|---|
| Wrong status code | Workflow response changed | Run `/update-tests [name]` |
| `TypeError: fetch failed` | Endpoint down or wrong URL | Check `n8n_health_check` |
| `getToken()` throws | Bad `TEST_USER_EMAIL` / `PASSWORD` in `.env.test` | Re-check credentials |
| `db.queryOne` returns null | DB row missing or wrong slug | Verify test client exists |
| Test times out | LLM response slow or stuck | Retry; check n8n execution log |

State the proposed fix clearly before asking what to do.

### 6. Learn and improve (self-improving behavior)

After each run, do ALL of the following that apply:

**A. If a test fails due to a changed status code or response field:**
- Write a memory: `feedback` type, slug `test-failure-[workflow-slug]-[date]`, noting what changed and what the correct assertion is now
- Propose running `/update-tests [workflow name]` to fix it

**B. If a test times out or hits a connection error:**
- Write a memory: `project` type, noting the endpoint was unreachable at this time (with date)
- Check `mcp__n8n-prod__n8n_health_check` and report

**C. If credential skips occur:**
- Check memory for `test-credentials-setup` — if it exists, recall which vars are missing and remind the user specifically
- If the same skip has been seen 3+ times in memory, write a `feedback` memory: "User consistently skips [X] — consider removing that test or auto-seeding a credential"

**D. After any run where something failed and was then fixed:**
- Update the plan doc [`.claude/plans/test-infrastructure.md`](../plans/test-infrastructure.md) — mark the relevant phase note as resolved if it was a known issue
- If the fix revealed a new pattern (new error code, new field name), add it to the relevant test fixture or helper so it doesn't break again

**E. At the end of every run:**
- If all tests pass: say "✅ All [N] tests passing. No action needed."
- If skips only (no failures): say "✅ [N] passed, [M] skipped due to missing credentials. To unlock skipped tests, add [specific vars] to `.env.test`."
- If failures: show the diagnosis table and ask whether to fix now or log for later.

---

## Shortcut: What I always do first

Before running any test, I check memory for:
- `test-credentials-setup` — do I know which vars are in `.env.test`?
- Any recent `test-failure-*` memories — are there known fragile tests to watch?
- `staging-down` or similar project memories — is the target env known to be unstable?

This lets me give smarter failure diagnoses without re-discovering the same issues each session.
