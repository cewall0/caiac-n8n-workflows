# Run Tests

Run the CAIAC n8n integration test suite or smoke suite and report results.

**Usage:**
- `/run-tests` — full integration suite (requires `.env.test`)
- `/run-tests smoke` — smoke suite against prod (no credentials needed)
- `/run-tests [filename]` — single test file, e.g. `/run-tests auth`

---

## Steps

### 1. Parse args
- If arg is `smoke` or `smoke only` → run smoke suite
- If arg matches a filename (e.g. `auth`, `lead-capture`) → run that single file
- If no args → run full integration suite

### 2. Check prerequisites

**For integration tests (non-smoke):**
- Check if `.env.test` exists in the project root
- If missing: stop and tell the user: "`.env.test` is missing. Copy from `.env.test.example` and fill in `DATABASE_URL`, `WEBHOOK_HEADER_KEY`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `CAIAC_STAFF_EMAIL`, `CAIAC_STAFF_PASSWORD`."
- Check if `node_modules/` exists; if not, tell user to run `npm install` first

**For smoke tests:**
- No prerequisites — smoke runs without credentials

### 3. Run the tests

**Smoke:**
```
N8N_WEBHOOK_BASE=https://flows.caiacdigital.com npx vitest run --config vitest.smoke.config.ts --reporter=verbose
```

**Single file** (e.g. arg = `auth`):
```
npx vitest run tests/workflows/auth.test.ts --reporter=verbose
```
If the arg doesn't exactly match a filename, glob `tests/workflows/*{arg}*.test.ts` and use the first match.

**Full suite:**
```
npx vitest run --reporter=verbose
```

Run via Bash tool. Capture full output.

### 4. Parse and report results

From the vitest output, extract:
- Total tests: `X passed`, `Y failed`, `Z skipped`
- Per-file: pass/fail counts
- Failing test names with file path and line number (the `❯ file.test.ts:42` lines)
- Any `console.warn` lines (these are intentional skips — show them separately)

**Report format:**

```
## Test Results — [suite name]

✅ X passed  ❌ Y failed  ⏭ Z skipped  (total: N)

### Failures
- [test name] — tests/workflows/auth.test.ts:42
  Error: expected 200 to equal 401

### Skipped (missing credentials)
- staff role can promote a real message — CAIAC_STAFF_EMAIL not configured

### Passed files
- ✅ auth.test.ts (4/4)
- ✅ lead-capture.test.ts (6/6)
- ❌ admin-toggle-feature.test.ts (3/5)
```

### 5. Diagnose failures (if any)

For each failure:
- If it's an `AssertionError` on a status code: the workflow may have changed. Suggest running `/update-tests [workflow name]`.
- If it's a connection error / timeout: staging/prod may be down. Check with `mcp__n8n-prod__n8n_health_check`.
- If it's a `getToken` failure: auth credentials in `.env.test` may be wrong.
- If it's a DB connection error: `DATABASE_URL` in `.env.test` may be wrong or the DB unreachable.

Propose the specific fix for each failure before asking the user what to do.
