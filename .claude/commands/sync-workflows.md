# Sync Workflows

Audit whether `workflows/*.json` files are current with production. Optionally pull stale/missing files and commit them.

**Usage:** `/sync-workflows` — report only  
**Usage:** `/sync-workflows --fix` — report + pull stale/missing + commit

---

## Steps

### 1. List prod workflows
Call `mcp__n8n-prod__n8n_list_workflows` to get all workflows with their `id`, `name`, `updatedAt`, `active`, and `isArchived` fields.

### 2. Read local files
For each `*.json` in `workflows/`, read the top-level `id`, `name`, `updatedAt`, and `versionId` fields.

### 3. Cross-reference
Match prod workflows to local files by the `id` field in the JSON (not by filename — filenames can drift). Build two sets:
- **Covered** — prod workflow has a matching local file (same `id`)
- **Missing** — active prod workflow with no local file

### 4. Classify each covered file as:
- ✅ **Current** — local `updatedAt` matches prod `updatedAt` exactly
- ⚠️ **Stale** — prod `updatedAt` is newer than the file's `updatedAt`
- ❓ **Unknown** — local file has no `updatedAt` field; fall back to comparing the file's last git commit date against prod `updatedAt`

Skip workflows that are:
- `isArchived: true`
- `active: false` AND marked `deactivated` in the registry
- Intentionally staging-only (e.g. `[Admin] Get DB Schema`) — check registry notes before skipping

### 5. Print results

```
SYNC CHECK — workflows/ vs prod (YYYY-MM-DD)

✅ Current (N)
  auth-refresh-v2.0.0.json        CAIAC Auth - Refresh v2.0.0

⚠️  Stale (N)
  full-auth-v2.0.0.json           [Utility] Full Auth v2.0.0
    file: 2026-06-19T00:09Z  |  prod: 2026-06-20T01:13Z

❌ Missing (N) — active in prod, no local file
  [Admin] Client Health Check v1.0.0    i28p9CZu2RnCsWYQ

Run /sync-workflows --fix to pull stale and missing files.
```

### 6. If `--fix` is passed
For each stale or missing workflow:
1. Call `mcp__n8n-prod__n8n_get_workflow` with `mode: "full"`
2. Write/overwrite the file in `workflows/` — use the existing filename for stale files; for missing files, derive the name from the convention in CLAUDE.md (kebab-case workflow name + version, drop `[Category]` brackets)
3. After all files are written, stage them and commit:
   ```
   sync: catch up N workflow(s) to prod (YYYY-MM-DD)
   ```
4. Update `workflows/README.md` to add any new file references

---

## Key Rules
- Match by `id` field in the JSON, not by filename — filenames can be wrong (as we found with `admin-client-health-check.json` containing the wrong workflow)
- Credential IDs in these JSON files are prod-specific — never use them to deploy back to staging
- Deactivated workflows (`active: false`) with existing local files: keep the file, report as **deactivated, file present** — don't auto-delete
- If prod has a workflow with no `updatedAt` in the list response, fetch it fully to compare `versionId`

---

## Open for Improvement

- [ ] **Node count sanity check** — compare `nodeCount` from the prod list against `nodes.length` in the local file before deep-fetching. A mismatch with matching timestamps would indicate the file was written incorrectly (e.g. truncated export).
- [ ] **Staging sync mode** — add `--env staging` to audit staging workflows instead of prod. Useful when building on staging before deploying, to verify staging files haven't drifted from local.
- [ ] **Selective fix** — `--fix <workflow-name-or-id>` to pull a single workflow rather than all stale ones at once.
- [ ] **Structural diff before write** — for stale files, print a node-level diff (names added/removed, connection changes) before overwriting, so you can see what changed without pulling blindly.
- [ ] **Auto-detect ID mismatches** — flag files where the `id` field is not found in the prod workflow list at all (i.e. the file holds a staging ID or a deleted workflow). Currently this only surfaces if timestamps happen to differ.
- [ ] **Registry drift detection** — cross-check the prod ID column in `workflows/README.md` against what `n8n_list_workflows` returns. Flag IDs in the registry that no longer exist in prod.
- [ ] **Batch commit grouping** — when `--fix` pulls multiple files, consider one commit per file (matches the two-commit snapshot pattern in CLAUDE.md) vs. one batched commit. Currently batches for speed.