# Update Tests

Keep test files in sync with live workflows. Reads the workflow from n8n, diffs against the test file, applies updates, and remembers what it learns.

**Usage:**
- `/update-tests [workflow name]` — sync one test file. Name can be partial: `toggle-feature`, `lead capture`, `delete leads`
- `/update-tests` — audit ALL test files for drift, then fix what's flagged

**When to run:**
- After any prod deploy that modifies an existing workflow
- When a test starts failing after a deploy
- Start of any session that touches existing workflows

---

## Steps

### 1. Resolve workflow → test file mapping

**If a name was given:**
1. Match against `workflows/README.md` — find the prod ID
2. If no match: search memory for `workflow-path-*` records; search `tests/workflows/` for filename similarity
3. Pull live workflow: `mcp__n8n-prod__n8n_get_workflow` with `mode: structure` first (fast, gets node names), then `mode: filtered` on the specific nodes needed (Webhook trigger, Validate/IF nodes, respondToWebhook nodes)

**If no arg:**
- Read the coverage table from `tests/README.md`
- For each row with a prod ID, pull the workflow and check for drift
- Produce a full audit report before making any changes

### 2. Extract live workflow contract

From the pulled workflow, identify:
- **Webhook path** — from the Webhook trigger node `path` parameter
- **HTTP method** — GET/POST
- **Required fields** — from any Code/IF/Set node that validates input (look for `throw new Error`, `if (!body.field)`, `$input.first().json.field`)
- **Response fields** — from respondToWebhook `responseBody` parameter (parse the template string)
- **Error status codes** — from respondToWebhook nodes on error branches (look for `responseCode: 401`, `responseCode: 400`)
- **Auth pattern** — Bearer header, body token, or no auth (compare to test's `Authorization` or `token` field usage)

### 3. Read current test file

Read `tests/workflows/[matched-file].test.ts` fully. Extract:
- Webhook path(s) in `http.post()` / `http.get()` calls
- Request body shapes in test cases
- `expect(res.status).toBe(...)` and `expect([X,Y]).toContain(res.status)` assertions
- `expect(res.body.field)` assertions

### 4. Diff and classify

For each dimension:

| Dimension | Drift = | Action |
|---|---|---|
| Path | Test path ≠ live path | UPDATE path string |
| Method | Test uses POST, workflow is GET | UPDATE http method |
| Required field | Test doesn't send a field the workflow validates | ADD to request body |
| Response field | Test asserts `res.body.X`, workflow returns `res.body.Y` | UPDATE field name |
| Error code | Test expects 400, workflow throws 500 | WIDEN to `[400, 500]` |
| Auth pattern | Test uses header, workflow reads body token | UPDATE auth approach |

Show the full diff table before making changes.

**No drift:** say "✅ Test is in sync with live workflow — no changes needed." and stop.

### 5. Apply updates (with confirmation)

For each UPDATE or WIDEN:
1. Show the specific before → after change
2. Apply it directly (don't ask unless the change is ambiguous or destructive)
3. After all edits, run the test: `npx vitest run tests/workflows/[file].test.ts --reporter=verbose`
4. If it still fails: read the error, reason about what else changed, propose the next fix

### 6. Write to memory (self-improving)

After any run, write memories for anything new learned:

**Pattern change** → `feedback` memory:
```
slug: workflow-contract-[workflow-slug]
type: feedback
body: "[Workflow name] as of [date]: path is X, auth is Y, returns {field: type}.
  Why: updated from [old] to [new] in deploy on [date].
  How to apply: use this shape in tests; update if workflow is versioned again."
```

**Recurring failure** → `feedback` memory:
```
"[Test name] breaks when [workflow name] is updated. Why: this workflow changes
frequently. How to apply: run /update-tests [name] before each deploy."
```

**New endpoint discovered** (workflow in registry but no test file) → `project` memory:
```
"[Workflow name] has no test file. Prod ID: X. Webhook: POST /path.
How to apply: run 'create test file for [workflow name]' to scaffold."
```

After writing memory, always check if this resolves or updates an existing memory rather than duplicating it.

### 7. Update plan doc

After applying fixes, update [`.claude/plans/test-infrastructure.md`](../plans/test-infrastructure.md):
- If a Phase 0 issue was fixed: mark it as resolved
- If a new gap was discovered: add it to the Coverage Map with status ❌ or ⚠️

### 8. Commit

```bash
git add tests/workflows/[file].test.ts
git commit -m "fix: sync [workflow name] tests — [brief description of what changed]"
```

---

## No-Arg Mode (Full Audit)

Pull every workflow in the coverage table and produce:

```
## Test Drift Audit — [date]

✅ auth.test.ts — in sync (auth-signin-v2.0.0, auth-refresh, signout)
✅ lead-capture.test.ts — in sync (intake-lead-capture-v2.1.0)
⚠️  chat-v26.test.ts — path drift: test=caiac/chat/v26-staging, live=caiac/chat/v26
❌ admin-toggle-feature.test.ts — response field `success` → `ok` in latest
❓ sign-review-token.test.ts — workflow not found in registry; path may have changed

Fix all flagged? (type 'yes' to fix all, or list specific names)
```

After audit, update the Coverage Map table in the plan doc to reflect current state.

---

## What "self-improving" means here

Each time this skill runs and finds something:
1. It writes a memory so the next session knows about it without re-discovering
2. It updates the test file so the failure doesn't happen twice
3. It updates the plan doc so the coverage map stays accurate
4. If the same workflow drifts repeatedly, it notes that pattern in memory so future sessions can warn before deploying

Over time, the memory accumulates a picture of which workflows are stable, which change often, and which test patterns are reliable — so test maintenance gets faster, not slower.
