# Deploy Workflow to Prod

Deploy a workflow from staging to prod with full safety checks. Updates `workflows/README.md`, `docs/prod-state.md`, and `workflows/*.json` as part of the flow.

**Usage:** `/deploy [workflow name]`  
**Example:** `/deploy [Chat] CAIAC RAG - Chat v2.6.0`

---

## Steps

### 1. Resolve the workflow
- Match arg against workflow names in `workflows/README.md`
- If ambiguous, list the matches and ask which one
- Get staging version via `mcp__n8n__n8n_get_workflow` using staging ID from README
- Get current prod version via `mcp__n8n-prod__n8n_get_workflow` using prod ID (if it exists)

### 2. Pre-deploy checklist (run silently, report failures)
- [ ] Workflow is activated and has recent successful execution in staging
- [ ] Credential names used in staging JSON all exist on prod — list any mismatches
- [ ] If billable feature: `client_features` seed + toggle workflows already have the feature key
- [ ] `workflows/README.md` row exists for this workflow
- [ ] Check `docs/prod-state.md` "Known Prod Bugs" — flag if this workflow has a known bug that should be fixed first
- [ ] No in-progress migrations that this workflow depends on

If any check fails, **stop and report**. Do not proceed.

### 3. Show the diff (new workflow vs current prod)
For updates (workflow already exists on prod), show:
- Node count change
- Any node names added/removed
- Version bump (name change)
- Key config differences (webhook paths, credential names)

**Wait for user confirmation before proceeding.**

### 4. Pre-update snapshot (for updates only)
1. Save current prod JSON to `workflows/<kebab-name>.json`
2. Commit: `"snapshot: <workflow name> before update"`

This is the rollback point.

### 5. Deploy
- **New workflow:** `mcp__n8n-prod__n8n_create_workflow` with staging JSON
- **Update:** `mcp__n8n-prod__n8n_update_full_workflow` with staging JSON

Activation is **not automatic** — ask explicitly: "Activate on prod now?"

### 5b. Force webhook re-registration (required for any webhook-triggered workflow)
After activation, **always** do a deactivate → reactivate cycle if the workflow has a Webhook trigger node. n8n does not reliably register webhook paths on first activation — skipping this causes silent 404s with no execution log.

```
mcp__n8n-prod__n8n_update_partial_workflow  →  deactivateWorkflow
mcp__n8n-prod__n8n_update_partial_workflow  →  activateWorkflow
```

This applies to new deploys AND updates. It is safe to run even if the webhook was already working.

### 6. Post-deploy updates (all required)
After successful deploy:

**a. Save deployed JSON**
- `mcp__n8n-prod__n8n_get_workflow` → overwrite `workflows/<kebab-name>.json`
- Commit: `"sync: <workflow name> v<version> — deploy to prod"`

**b. Update `workflows/README.md`**
- Fill in Prod ID if new
- Change status from `staging` → `active`
- If this is a version bump: move old row to `pending-deactivate`

**c. Update `docs/prod-state.md`**
- Remove the workflow from "Staged But Not On Prod" if it was there
- If this fixes a known bug: remove the bug from "Known Prod Bugs"
- If old version is now pending-deactivate: add it to "Pending Deactivation" if not already listed

**d. Commit docs update**
- `"chore: update README + prod-state after <workflow name> deploy"`

### 7. Report
```
✅ Deployed: [Workflow Name] → prod ID: [id]
  Activation: [activated | pending — say 'activate [name] on prod']
  Snapshot: [commit hash]
  Deploy:    [commit hash]
  
  Docs updated: workflows/README.md, docs/prod-state.md, workflows/<file>.json
```

---

## Rollback

If something breaks after deploy:
```
git show HEAD~1:workflows/<file>.json  # the pre-deploy snapshot
```
Then: `mcp__n8n-prod__n8n_update_full_workflow` with that JSON (user confirmation required).
