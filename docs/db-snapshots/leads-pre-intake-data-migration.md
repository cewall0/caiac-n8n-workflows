# Snapshot: caiac.leads — pre intake_data migration

**Date:** 2026-06-25  
**Migration:** Add `intake_data`, `crm_external_id`, `crm_synced_at` columns + swap UNIQUE constraint  
**Schema pulled from:** live DB via `[Temp] Schema + Migration Runner` (execution 183)

---

## Current Columns

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `client_id` | uuid | NOT NULL | — |
| `crm_type` | text | NOT NULL | — |
| `source_id` | text | NOT NULL | — |
| `source_channel` | text | YES | — |
| `service` | text | YES | — |
| `lifecycle_stage` | text | YES | `'intake'::text` |
| `intake_fingerprint` | text | YES | — |
| `qualification_score` | smallint | YES | — |
| `qualification_score_reason` | text | YES | — |
| `next_action_at` | timestamptz | YES | — |
| `created_at` | timestamptz | YES | now() |
| `updated_at` | timestamptz | YES | now() |

**Missing (to be added):** `intake_data JSONB`, `crm_external_id TEXT`, `crm_synced_at TIMESTAMPTZ`

---

## Migration SQL

### Step 1 — Add columns (safe, run now)
```sql
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS intake_data JSONB;
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_external_id TEXT;
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_synced_at TIMESTAMPTZ;
```

### Step 2 — Replace UNIQUE constraint (run now)
```sql
-- Verify name first:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'caiac.leads'::regclass AND contype = 'u';
ALTER TABLE caiac.leads DROP CONSTRAINT leads_client_id_crm_type_source_id_key;
ALTER TABLE caiac.leads ADD CONSTRAINT leads_client_fingerprint_unique UNIQUE (client_id, intake_fingerprint);
```

### Step 3 — Drop redundant columns (AFTER Lead Capture v2.1.0 deployed to prod)
```sql
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_type;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS source_id;
```

---

## Rollback (Steps 1 + 2)

```sql
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS intake_data;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_external_id;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_synced_at;
ALTER TABLE caiac.leads DROP CONSTRAINT IF EXISTS leads_client_fingerprint_unique;
ALTER TABLE caiac.leads ADD CONSTRAINT leads_client_id_crm_type_source_id_key UNIQUE (client_id, crm_type, source_id);
```
