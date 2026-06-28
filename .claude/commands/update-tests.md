# Update Tests

Keep test files in sync when a workflow changes. Reads the live workflow from n8n, diffs the request/response shape against the current test file, and applies updates.

**Usage:**
- `/update-tests [workflow name]` — e.g. `/update-tests "[Admin] Toggle Client Feature v1.0.0"`
- `/update-tests` (no arg) — audit ALL test files against their live workflows and report what's drifted

**When to run:**
- Any time you deploy an updated workflow to prod
- When a test starts failing after a prod deploy
- At the start of a session that will modify existing workflows

---

## Steps

### 1. Resolve the workflow

If a workflow name was given:
1. Look it up in `workflows/README.md` to get the prod ID
2. Call `mcp__n8n-prod__n8n_get_workflow` with that ID, mode `filtered`, targeting the key nodes (Webhook trigger, any Validate/Check nodes, respondToWebhook nodes)
3. Identify: webhook path, HTTP method, required body fields, response fields, error status codes

If no arg given:
- Read `tests/README.md` coverage table
- For each test file that maps to an active prod workflow, do the same lookup
- Produce a drift report (see Step 4)

### 2. Read the current test file

Find the matching test file in `tests/workflows/`. Read it fully.

Extract:
- The webhook path(s) being tested
- The request shapes used in happy-path tests
- The expected status codes
- The response field assertions (e.g. `expect(res.body.token).toBe(...)`)

### 3. Diff live vs test

Compare what the live workflow expects/returns vs what the test asserts:

| Thing to check | How to detect drift |
|---|---|
| Webhook path | Does the path in the test match the live Webhook node's `path` param? |
| Required request fields | Does the live Validate/IF node check for fields the test doesn't send (or vice versa)? |
| Response shape | Does the live respondToWebhook body include fields the test asserts? |
| Status codes | Are the test's `expect([401, 403])` assertions still correct given the live error paths? |
| Auth pattern | Is it still Bearer header, or has it changed to body token? |

### 4. Report

Show a clear before/after table:

```
## Drift Report — [Workflow Name]

| What | Test expects | Workflow does today | Action |
|---|---|---|---|
| POST path | `caiac/chat/v26-staging` | `caiac/chat/v26` | UPDATE |
| Missing field error | 400 | 500 (throws) | WIDEN (400 or 500) |
| Response field | `res.body.token` | `res.body.access_token` | UPDATE |
| Auth header | Bearer | unchanged | OK |
```

If there's no drift: "✅ Test is in sync with live workflow — no changes needed."

### 5. Apply updates

For each "UPDATE" or "WIDEN" action:
- Ask: "Apply this fix? (y/n)" — or if running with a flag like `--apply`, apply all without asking
- Make the specific edit to the test file
- After all edits, run the affected test to confirm it passes: `npx vitest run tests/workflows/[file].test.ts`

### 6. Write to memory if pattern is new

If you discover a new auth pattern, new error code, or new response shape that isn't documented anywhere:
- Write it to a memory file in `~/.claude/projects/.../memory/`
- Type: `feedback` — e.g. "workflow X now returns 422 instead of 400 for missing fields"

### 7. Commit

If any files were changed:
```
git add tests/workflows/[file].test.ts
git commit -m "fix: update [workflow name] tests — sync with v[N] response shape"
```

---

## No-Arg Mode (Full Audit)

When run with no arg, produce a one-line status per test file:

```
✅ auth.test.ts — in sync
✅ lead-capture.test.ts — in sync
⚠️  chat-v26.test.ts — path uses v26-staging, prod is now caiac/chat/v26
❌ admin-toggle-feature.test.ts — response field `success` renamed to `ok` in latest deploy
❓ sign-review-token.test.ts — no workflow found with this name in registry
```

Then ask: "Fix all flagged files? (y = fix all, n = pick individually)"
