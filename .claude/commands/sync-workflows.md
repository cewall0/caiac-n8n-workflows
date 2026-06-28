# Sync Workflows

Audit whether `workflows/*.json` files are current with production (or staging). Optionally pull stale/missing files and commit them.

**Usage:** `/sync-workflows` — report only  
**Usage:** `/sync-workflows --fix` — report + pull all stale/missing + commit  
**Usage:** `/sync-workflows --fix <name-or-id>` — pull a single workflow by name or prod ID  
**Usage:** `/sync-workflows --env staging` — audit staging instead of prod  

---

## Steps

### 1. Determine environment
If `--env staging` is passed, use `mcp__n8n__` tools and `flows-staging.caiacdigital.com`. Otherwise use `mcp__n8n-prod__` tools and `flows.caiacdigital.com` (default).

### 2. List remote workflows
Call `n8n_list_workflows` on the target environment. Collect `id`, `name`, `updatedAt`, `active`, `isArchived`, and `nodeCount` for every workflow.

### 3. Read local files
For each `*.json` in `workflows/`, read:
- `id` — the workflow ID (may be a staging or prod ID)
- `name`
- `updatedAt` (may be absent in older exports)
- `versionId`
- `nodes.length` (count of nodes array)

Build a lookup map: `localById[id] = { file, name, updatedAt, versionId, nodeCount: nodes.length }`.

### 4. Cross-reference and classify

For each remote workflow:

- **Skip** if `isArchived: true`
- **Skip** if `active: false` AND the workflow is marked `deactivated` in `workflows/README.md`
- **Skip** if the registry notes mark it staging-only (e.g. `[Admin] Get DB Schema`)

Otherwise classify as:

| Status | Symbol | Condition |
|---|---|---|
| Current | ✅ | Local file exists, `updatedAt` matches prod exactly, `nodeCount` matches `nodes.length` |
| Stale | ⚠️ | Local file exists but prod `updatedAt` is newer than file's `updatedAt` |
| Suspect | 🔍 | Timestamps match but prod `nodeCount` ≠ local `nodes.length` — file may be a truncated or partial export |
| Unknown | ❓ | Local file has no `updatedAt`; fall back to last git commit date for the file vs prod `updatedAt` |
| Missing | ❌ | No local file with a matching `id` |
| Wrong env | 🔀 | Local file's `id` is not found in the remote workflow list at all — file likely holds a staging ID (or the workflow was deleted) |

The **Wrong env** check: after building `localById`, scan all local files. Any file whose `id` does not appear in the remote list gets flagged 🔀. This catches the case where a file was exported from staging and never updated to the prod ID.

### 5. Registry drift detection
Parse `workflows/README.md` and extract all prod IDs (the second column in each table row, format `` `<ID>` ``). For each ID that is not `—`:
- If the ID does not appear in the remote workflow list → flag as **🗑 Registry ghost** (ID in registry no longer exists in prod)
- If the ID exists in prod but the registry row has a different `active` status than prod → flag as **📋 Status mismatch**

### 6. Print results

```
SYNC CHECK — workflows/ vs prod (YYYY-MM-DD)

✅ Current (N)
  auth-refresh-v2.0.0.json              CAIAC Auth - Refresh v2.0.0

⚠️  Stale (N) — prod is newer
  full-auth-v2.0.0.json                 [Utility] Full Auth v2.0.0
    file: 2026-06-19T00:09Z  |  prod: 2026-06-20T01:13Z

🔍 Suspect (N) — timestamps match but node count differs
  chat-v2.5.0.json                      CAIAC RAG - Chat v2.5.0
    local nodes: 24  |  prod nodeCount: 27

❓ Unknown (N) — no updatedAt in file, using git date
  admin-list-clients.json               [Admin] List Clients v1.0.0
    git commit: 2026-06-19  |  prod: 2026-06-19  →  likely current

🔀 Wrong env (N) — id not found in prod
  old-chat-v2.4.1.json                  CAIAC RAG - Chat v2.4.1  (id: Wdn95...)
    Staging ID — needs prod export

❌ Missing (N) — active in prod, no local file
  [Admin] Ingest Document v1.0.0        0VTWcZB0P0oTFo9c

🗑  Registry ghosts (N) — prod ID in README no longer exists
  validate-auth-v1.0.0 row → ID 25FQf7oSGTBlLXqz gone from prod

📋 Status mismatches (N) — registry says X, prod says Y
  CAIAC RAG - Chat v2.4.1  →  registry: pending-deactivate  |  prod: active

Run /sync-workflows --fix to pull stale, suspect, and missing files.
```

### 7. If `--fix` is passed (all stale/missing)
For each stale, suspect, or missing workflow — or only the one matching `<name-or-id>` if specified:

1. **Show a node-level diff first** (for stale/suspect files):
   - Read the local file's `nodes[].name` list
   - Call `mcp__n8n-prod__n8n_get_workflow` with `mode: "structure"` to get the prod node names cheaply
   - Print: nodes added in prod, nodes removed from local
   - Only then fetch the full workflow (`mode: "full"`) and write the file

2. **Write the file**:
   - Stale/suspect: overwrite the existing file path
   - Missing: derive filename from CLAUDE.md convention (kebab-case workflow name + version, drop `[Category]` brackets)
   - Wrong-env files: overwrite in place with the correct prod JSON

3. **Update `workflows/README.md`**: add file references for any newly added files

4. **One batched commit** after all files are written:
   ```
   sync: catch up N workflow(s) to prod (YYYY-MM-DD)
   ```
   List each file updated in the commit body.

---

## Key Rules
- **Match by `id` field in the JSON, not by filename** — filenames can be wrong (e.g. `admin-client-health-check.json` once held the wrong workflow entirely)
- **Credential IDs are env-specific** — prod JSON files must never be used to deploy back to staging
- **Deactivated workflows with local files**: keep the file, surface as deactivated but don't auto-delete
- **`--fix` does not touch registry ghost rows** — those require a human decision (delete from README? deactivate in n8n?)
- **`--fix` does not touch status mismatches** — report them; don't auto-update the registry