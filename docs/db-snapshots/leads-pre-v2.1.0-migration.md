# Schema Snapshot: caiac.leads — Pre v2.1.0 Migration

**Date:** 2026-06-24  
**Purpose:** Rollback reference before adding `intake_data`, `crm_external_id`, `crm_synced_at` and replacing the UNIQUE constraint.  
**Source:** Derived from live workflow SQL (Lead Capture v2.0.0 INSERT + ON CONFLICT clause).

---

## caiac.leads — Current Columns

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID | NOT NULL | PRIMARY KEY, gen_random_uuid() |
| `client_id` | UUID | NOT NULL | FK → caiac.clients(id) |
| `crm_type` | TEXT | nullable | Always 'form' — being removed (duplicate of source_channel semantically) |
| `source_id` | TEXT | nullable | Always = `intake_fingerprint` — being removed (duplicate) |
| `source_channel` | TEXT | nullable | 'form' \| 'sms' \| 'chat' |
| `lifecycle_stage` | TEXT | nullable | 'intake' → future stages |
| `intake_fingerprint` | TEXT | nullable | Dedup hash (email LCG hash, 32-char hex) |
| `qualification_score` | NUMERIC | nullable | 0–10 AI score |
| `qualification_score_reason` | TEXT | nullable | AI score explanation |
| `created_at` | TIMESTAMPTZ | nullable | Assumed — standard column |

## Current UNIQUE Constraint

```sql
UNIQUE (client_id, crm_type, source_id)
-- Constraint name (to verify before drop): leads_client_id_crm_type_source_id_key
```

Verify with:
```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'caiac.leads'::regclass AND contype = 'u';
```

---

## Migration SQL (Phase 1 — run by cewall0)

```sql
-- Step 1: Add new columns
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS intake_data JSONB;
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_external_id TEXT;
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_synced_at TIMESTAMPTZ;

-- Step 2: Replace UNIQUE constraint
-- First verify constraint name above, then:
ALTER TABLE caiac.leads DROP CONSTRAINT leads_client_id_crm_type_source_id_key;
ALTER TABLE caiac.leads ADD CONSTRAINT leads_client_fingerprint_unique UNIQUE (client_id, intake_fingerprint);

-- Step 3: Drop redundant columns (ONLY after Lead Capture v2.1.0 is deployed to prod)
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_type;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS source_id;
```

## Rollback (if migration needs to be reversed before Step 3)

```sql
-- Reverse Step 2:
ALTER TABLE caiac.leads DROP CONSTRAINT IF EXISTS leads_client_fingerprint_unique;
ALTER TABLE caiac.leads ADD CONSTRAINT leads_client_id_crm_type_source_id_key UNIQUE (client_id, crm_type, source_id);

-- Reverse Step 1:
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS intake_data;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_external_id;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_synced_at;
```

---

> **Note:** Schema derived from workflow SQL analysis, not a direct `pg_dump`. Before running migration, cewall0 should verify column list with:
> ```sql
> SELECT column_name, data_type, is_nullable, column_default
> FROM information_schema.columns
> WHERE table_schema = 'caiac' AND table_name = 'leads'
> ORDER BY ordinal_position;
> ```
