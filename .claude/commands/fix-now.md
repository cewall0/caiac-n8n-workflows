# Fix Now

Fix a known bug without creating a plan. Builds the fix in staging, deploys to prod, and clears it from `docs/prod-state.md`. For small, self-contained fixes only.

**Usage:** `/fix-now [description]`  
**Examples:**
- `/fix-now Chat v2.6.0 cap reads hardcoded 100 instead of client_features.config`
- `/fix-now Get AI Usage sql injection in slug param`
- `/fix-now Get AI Usage metadata column should be config`

---

## When to use this vs a plan

Use `/fix-now` when ALL of the following are true:
- The bug is in a single workflow (one file)
- The fix takes under 30 minutes
- No DB migration required
- No frontend change required

If any of those are false, the fix belongs in a plan phase.

---

## Steps

### 1. Identify the workflow and bug
- Match description to a workflow in `workflows/README.md` or `docs/prod-state.md`
- Get current staging version: `mcp__n8n__n8n_get_workflow`
- Get current prod version: `mcp__n8n-prod__n8n_get_workflow`
- Confirm the bug exists in the current prod version — if it's already fixed, say so and stop

### 2. Build the fix in staging
- Apply the minimal change needed to fix the bug
- Rename the fix node or update the sticky note to document the change
- `mcp__n8n__n8n_update_full_workflow` to save to staging

### 3. Verify in staging
- Check recent executions: `mcp__n8n__n8n_executions`
- If the workflow can be triggered without side effects, trigger it and confirm it passes

### 4. Show the fix
Tell the user:
- What was wrong
- What changed (show the specific node/SQL/value that changed)
- Any edge cases or risks

**Wait for confirmation before deploying to prod.**

### 5. Deploy to prod (same flow as `/deploy`)
- Snapshot current prod JSON: save to `workflows/<file>.json`, commit `"snapshot: <name> before fix"`
- Deploy: `mcp__n8n-prod__n8n_update_full_workflow`
- Save deployed JSON, commit: `"fix: <description> in <workflow name>"`

### 6. Update docs
- `docs/prod-state.md` → remove the bug from "Known Prod Bugs"
- `workflows/README.md` → update notes column if the fix changes how the workflow behaves

Commit: `"chore: mark <bug> fixed in prod-state"`

### 7. Report
```
✅ Fixed: [description]
  Workflow: [name] (prod ID: [id])
  Commits: [snapshot hash], [fix hash]
  prod-state.md: bug removed from Known Prod Bugs
```
