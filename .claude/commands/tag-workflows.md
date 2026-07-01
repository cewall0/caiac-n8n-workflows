# Tag Workflows

Audit n8n workflow tags against the platform tag scheme. Reports missing and unexpected tags; optionally applies fixes.

**Usage:** `/tag-workflows` — report both environments  
**Usage:** `/tag-workflows --env staging` — staging only  
**Usage:** `/tag-workflows --env prod` — prod only  
**Usage:** `/tag-workflows --fix` — report + apply all missing tags (both envs, requires prod confirmation)  
**Usage:** `/tag-workflows --fix --env staging` — fix staging only, no prod confirmation needed  

---

## Tag Scheme

The full platform tag list. Every workflow must have at least one:

| Tag | Applies to |
|---|---|
| `admin` | Internal ops / admin dashboard endpoints |
| `auth` | Authentication, JWT, session management |
| `chat` | AI chat gateway & conversation routing |
| `client` | Client-facing public API endpoints |
| `deprecated` | Superseded versions kept for reference |
| `intake` | Lead capture & intake automation |
| `maintenance` | Scheduled background jobs |
| `onboarding` | Client provisioning & setup steps |
| `rag` | Document ingestion, vector search, AI evaluation |
| `reviews` | Review requests, rating tracking, response flows |
| `utility` | Shared sub-workflows called by other workflows |

---

## Steps

### 1. Determine scope

- Default: audit both staging (`mcp__n8n__`) and prod (`mcp__n8n-prod__`)
- `--env staging`: staging only
- `--env prod`: prod only

### 2. List workflows

Call `n8n_list_workflows` on each target environment. Collect `id`, `name`, `active`, `isArchived`, and `tags` for every workflow. Skip archived workflows (`isArchived: true`).

### 3. Infer expected tags per workflow

Apply these rules in order. A workflow may get multiple expected tags.

**Primary tag — from `[Category]` bracket in name:**

| Bracket | Primary tag |
|---|---|
| `[Admin]` | `admin` |
| `[Chat]` | `chat` |
| `[Client]` | `client` |
| `[Intake]` | `intake` |
| `[Logging]` | `utility` |
| `[Onboarding]` | `onboarding` |
| `[Reviews]` | `reviews` |
| `[Utility]` | `utility` |

**Primary tag — no bracket, infer from name prefix:**

| Name prefix | Primary tag |
|---|---|
| `CAIAC Auth -` | `auth` |
| `CAIAC RAG -` | `rag` |
| `CAIAC Maintenance -` | `maintenance` |
| `CAIAC Admin Health` | `admin` |
| `CAIAC Demo -` | `deprecated` + `intake` |
| `CAIAC - Activity Feed` | *(skip — leave untagged, flag as unclassified)* |
| `My workflow` | *(skip — scratch workflow, flag as unclassified)* |

**Secondary tags — added on top of primary:**

| Condition | Add tag |
|---|---|
| Name contains `Ingest`, `Delete Document`, `Ragas`, `Eval Status`, `Ingest Preview`, or `Client Health Check` | `rag` |
| Name matches `CAIAC RAG - Chat` (any version) | `chat` |
| Name is `[Utility] Full Auth` or `[Utility] Validate Auth` | `auth` |
| Name matches `[Utility] Score Lead`, `[Utility] Mark Review Sent`, `[Utility] Record Rating`, `[Utility] Get Client Review Config`, or `[Utility] Sign Review Token` | `reviews` |

**Deprecated rule:**

A workflow gets `deprecated` added if:
- It is `active: false`, AND
- Another workflow with the same base name but a higher version number exists in the same environment (e.g. `v1.3.1` when `v2.0.0` also exists), OR
- Its name starts with `CAIAC Demo -`

### 4. Diff actual vs expected

For each workflow, compare the set of actual tag names against the inferred expected set:

- **Missing** — expected tag not in actual tags
- **Extra** — actual tag not in expected tags (flag for review, never auto-remove)
- **Unclassified** — no expected tags could be inferred (scratch/unknown workflows)

### 5. Print report

```
TAG AUDIT — staging + prod (YYYY-MM-DD)

STAGING
───────
✅ Fully tagged (N)
  [Admin] Run Ragas Eval v2.0.0          admin, rag
  CAIAC Auth - Signin v2.0.0             auth

⚠️  Missing tags (N)
  [Admin] Get Client Config v1.0.0       has: —  missing: admin
  [Onboarding] Trigger Onboarding v1.0.0 has: —  missing: onboarding

➕ Extra tags (N) — review manually, not auto-removed
  [Utility] Score Lead v1.0.0            extra: reviews  (expected: utility)

❓ Unclassified (N) — can't infer tags from name
  My workflow

PROD
────
✅ Fully tagged (N)
  ...

⚠️  Missing tags (N)
  ...

Run /tag-workflows --fix to apply all missing tags.
```

### 6. If `--fix` is passed

For each workflow with missing tags:

1. For prod workflows: show the full list of changes first and wait for a single "yes/no" confirmation before writing anything to prod. Staging never requires confirmation.
2. Call `n8n_update_partial_workflow` with one `addTag` operation per missing tag.
3. Use `continueOnError: true` so a single failure doesn't block the rest.
4. After applying, print a summary: N tags added across M workflows, any failures listed.

**Never auto-remove extra tags** — only add. Removals require explicit user instruction.

---

## Key Rules

- **Add only, never remove** — `--fix` only adds missing tags; it never removes tags that are present but not in the expected set. Flag extras for manual review.
- **Skip archived** — `isArchived: true` workflows are ignored entirely.
- **Prod confirmation** — a single approval covers the entire prod batch; don't ask per-workflow.
- **Unclassified is not an error** — scratch and unknown workflows are flagged but not touched.
- **Extra tags are not errors** — a workflow may have tags beyond what the rules infer (e.g. hand-applied context tags). Surface them but don't remove.
