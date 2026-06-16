# Role Hierarchy Refactor

## What Changed

### Problem
The role hierarchy (which roles can see which documents) was hardcoded in a JavaScript object inside the `Validate Request` node in CAIAC RAG - Chat. Changing it required editing the workflow. There was also no validation on document roles at ingest time — a typo like `"Public"` would silently make a document invisible to everyone.

### Solution
Moved the hierarchy to a Postgres table (`caiac.role_hierarchy`) and added role validation at ingest.

---

## Role Hierarchy Table

**Table:** `caiac.role_hierarchy`

| role   | visible_roles                        |
|--------|--------------------------------------|
| owner  | public, staff, admin, owner          |
| admin  | public, staff, admin                 |
| staff  | public, staff                        |
| client | public                               |
| guest  | public                               |

To change the hierarchy, run a SQL UPDATE — no workflow changes needed:
```sql
UPDATE caiac.role_hierarchy
SET visible_roles = ARRAY['public', 'staff', 'admin', 'owner', 'manager']
WHERE role = 'owner';
```

---

## Workflows Updated

### CAIAC RAG - Chat v2.4.0 and v2.5.0

**Added:** `Get Role Permissions` node (Postgres) — runs after `Check Token Valid`, queries `caiac.role_hierarchy` for the user's role, returns `visible_roles`.

**Updated:** `Validate Request` node — replaced hardcoded `roleHierarchy` object with a read from `Get Role Permissions`. Falls back to `['public']` if the role isn't found.

**Chain (auth section):**
```
Check Token Valid → Get Role Permissions → Get Client Config → Validate Request
```

The `visible_roles` array flows into the Qdrant search filter, controlling which documents the user can retrieve.

### [Admin] Ingest Document v1.0.0

**Updated:** `Check Token Valid` node — added validation that `body.role` is one of `public`, `staff`, `admin`, `owner`. Throws a clear error if not:
```
Invalid document role: "Public". Must be one of: public, staff, admin, owner
```

---

## How Document Visibility Works (End to End)

1. Document is ingested with a `role` field (e.g. `"staff"`) stamped on every Qdrant chunk.
2. User signs in — their role (e.g. `"admin"`) is stored in `caiac.sessions`.
3. Chat request arrives — `Get Role Permissions` looks up `admin` → `['public', 'staff', 'admin']`.
4. Qdrant search filters to chunks where `role` matches any value in `allowed_roles`.
5. A `staff` user sees `public` + `staff` documents. An `admin` also sees `admin` documents. A `guest` sees only `public`.

---

## Migration

**Workflow:** `[Utility] Migrate - Role Hierarchy Table v1.0.0`

Idempotent — safe to re-run. Uses `INSERT ... ON CONFLICT DO UPDATE` so re-running updates existing rows rather than failing.
