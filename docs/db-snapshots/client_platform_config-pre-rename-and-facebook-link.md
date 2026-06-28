# Schema Snapshot: caiac.client_platform_config

**Captured:** 2026-06-28 (before migration 1 ran)
**Table:** `caiac.client_platform_config`

---

## Pre-Migration Schema

| Column | Data Type | Nullable | Default |
|---|---|---|---|
| client_slug | text | NOT NULL | — |
| client_id | uuid | NOT NULL | — |
| source_type | text | YES | — |
| lead_sheet_id | text | YES | — |
| lead_sheet_tab | text | YES | — |
| google_review_link | text | YES | — |
| client_admin_email | text | YES | — |
| link_signing_secret | text | YES | — |
| active | boolean | YES | true |
| intake_config | jsonb | YES | — |
| updated_at | timestamptz | YES | now() |

**Constraints:**
- PRIMARY KEY: `client_slug`
- FOREIGN KEY: `client_id` → `caiac.clients.id`

---

## Migration 1 — Run 2026-06-28 ✅

```sql
ALTER TABLE caiac.client_platform_config
  ADD COLUMN IF NOT EXISTS facebook_review_link TEXT;
```

**Result:** Column added successfully. No existing rows affected (NULL by default).
**Rollback:** `ALTER TABLE caiac.client_platform_config DROP COLUMN facebook_review_link;`

---

## Migration 2 — Pending (not yet run)

**Prerequisite:** Deploy updated `[Reviews] Handle Rating Click v1.0.0` and `[Onboarding] Setup Client Sheet v1.0.0` to prod first (both must use `review_notify_email` before rename runs).

```sql
ALTER TABLE caiac.client_platform_config
  RENAME COLUMN client_admin_email TO review_notify_email;
```

**Rollback:** `ALTER TABLE caiac.client_platform_config RENAME COLUMN review_notify_email TO client_admin_email;`
**Window:** Off-hours. Run SQL → deploy both workflow updates within same minute. Gap consequence: missed followup email (recoverable).
