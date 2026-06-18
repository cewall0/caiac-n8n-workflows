# Step 0 Migration — Platform Config Restructure

**Status:** Not yet run  
**Verified:** `caiac.clients.id UUID` already exists as PK (confirmed from live schema 2026-06-17)  
**Must run before:** Building `caiac.leads`, `caiac.client_crm_configs`, or any new table that FKs to `caiac.clients`

---

## What's Already Done

`caiac.clients` was built with `id UUID PRIMARY KEY` from the start. No migration needed there.

```
caiac.clients
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  slug            TEXT NOT NULL          ← URL handle / display label (not a FK target)
  name            TEXT NOT NULL
  webhook_secret  TEXT NOT NULL
  jwt_secret      TEXT NOT NULL
  config          JSONB NOT NULL DEFAULT '{}'
  tier            TEXT NOT NULL DEFAULT 'starter'
  active          BOOLEAN NOT NULL DEFAULT true
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## What Needs To Run

1. Rename `client_review_config` → `client_platform_config`
2. Add `client_id UUID FK`, backfill from slug, swap PK
3. Add platform expansion columns (no `crm_type`/`crm_config` — moved to `client_crm_configs`)
4. Create `caiac.client_crm_configs` (multi-CRM per client)
5. Fix `caiac.ai_usage_log.client_id TEXT → UUID`

---

## Pre-Flight Check

Run these before the migration to catch data problems:

```sql
-- Verify every client_platform_config row has a matching client slug
SELECT cpc.client_slug
FROM caiac.client_review_config cpc
LEFT JOIN caiac.clients c ON c.slug = cpc.client_slug
WHERE c.id IS NULL;
-- Must return 0 rows

-- Check for non-UUID values in ai_usage_log before altering
SELECT client_id FROM caiac.ai_usage_log
WHERE client_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- Must return 0 rows — if not, review with dad before proceeding
```

---

## Migration SQL

Run as a single transaction.

```sql
BEGIN;

-- ============================================================
-- PART 1: Rename + expand client_platform_config
-- ============================================================

-- 1a. Rename the table
ALTER TABLE caiac.client_review_config RENAME TO client_platform_config;

-- 1b. Add client_id UUID FK column
ALTER TABLE caiac.client_platform_config
  ADD COLUMN client_id UUID;

-- 1c. Backfill from slug join (safe — slug is UNIQUE on clients)
UPDATE caiac.client_platform_config cpc
SET client_id = c.id
FROM caiac.clients c
WHERE c.slug = cpc.client_slug;

-- 1d. Lock NOT NULL and add FK constraint
ALTER TABLE caiac.client_platform_config
  ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE caiac.client_platform_config
  ADD CONSTRAINT fk_cpc_client
  FOREIGN KEY (client_id) REFERENCES caiac.clients(id);

-- 1e. Swap PK from client_slug to client_id
-- NOTE: constraint name is still the original name after table rename
ALTER TABLE caiac.client_platform_config
  DROP CONSTRAINT client_review_config_pkey;

ALTER TABLE caiac.client_platform_config
  ADD CONSTRAINT client_platform_config_pkey PRIMARY KEY (client_id);

-- 1f. Add platform expansion columns
--     NOTE: no crm_type / crm_config here — those live in client_crm_configs
ALTER TABLE caiac.client_platform_config
  ADD COLUMN enabled_features   TEXT[] DEFAULT ARRAY['reviews'],
  ADD COLUMN intake_config      JSONB,          -- { telnyx_number, form_webhook_path, auto_reply_template }
  ADD COLUMN next_sync_at       TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN last_synced_at     TIMESTAMPTZ,
  ADD COLUMN sync_backoff_until TIMESTAMPTZ;

-- Leave client_slug column in place until all workflows carry client_id.
-- Drop in a follow-up migration after workflows are updated.


-- ============================================================
-- PART 2: Create client_crm_configs (multi-CRM per client)
-- ============================================================

CREATE TABLE caiac.client_crm_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES caiac.clients(id),
  crm_type    TEXT NOT NULL,   -- 'ghl' | 'hubspot' | 'zoho'
  crm_config  JSONB NOT NULL,  -- { api_key_encrypted, key_type, location_id, agency_id?, pipeline_id, trigger_stage }
  is_primary  BOOLEAN DEFAULT false,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, crm_type)
);


-- ============================================================
-- PART 3: Fix ai_usage_log.client_id TEXT → UUID
-- ============================================================

ALTER TABLE caiac.ai_usage_log
  ALTER COLUMN client_id TYPE UUID USING client_id::uuid;


COMMIT;
```

---

## After Migration

```
caiac.client_platform_config
  client_id           UUID PRIMARY KEY → caiac.clients(id)
  client_slug         TEXT             ← keep temporarily; drop after workflows updated
  source_type         TEXT DEFAULT 'sheet'
  google_review_link  TEXT
  client_admin_email  TEXT
  lead_sheet_id       TEXT
  lead_sheet_tab      TEXT DEFAULT 'Leads'
  link_signing_secret TEXT
  active              BOOLEAN DEFAULT true
  enabled_features    TEXT[]           ← ['reviews', 'nurture', 'appointments']
  intake_config       JSONB            ← { telnyx_number, form_webhook_path, auto_reply_template }
  next_sync_at        TIMESTAMPTZ
  last_synced_at      TIMESTAMPTZ
  sync_backoff_until  TIMESTAMPTZ
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ

caiac.client_crm_configs
  id          UUID PRIMARY KEY
  client_id   UUID → caiac.clients(id)
  crm_type    TEXT            ← 'ghl' | 'hubspot' | 'zoho'
  crm_config  JSONB           ← { api_key_encrypted, key_type, location_id, ... }
  is_primary  BOOLEAN
  active      BOOLEAN
  created_at  TIMESTAMPTZ
  updated_at  TIMESTAMPTZ
```

---

## GHL `crm_config` JSONB Shapes

**Location-level key (most common — client owns their own GHL location):**
```json
{
  "api_key_encrypted": "<base64 pgp ciphertext>",
  "key_type": "location",
  "location_id": "abc123",
  "pipeline_id": "pipe456",
  "trigger_stage": "Won"
}
```

**Agency-level key (CAIAC or reseller holds agency access):**
```json
{
  "api_key_encrypted": "<base64 pgp ciphertext>",
  "key_type": "agency",
  "agency_id": "agency789",
  "location_id": "abc123",
  "pipeline_id": "pipe456",
  "trigger_stage": "Won"
}
```

---

## n8n Workflow Updates

Carry both `client_id` and `client_slug` through workflow data after migration:

```json
{ "client_id": "uuid", "client_slug": "henderson" }
```

DB queries use `client_id`. Logs, display, and webhook paths use `client_slug`.

---

## Verification

```sql
-- Confirm client_id backfilled and FK in place
SELECT client_slug, client_id FROM caiac.client_platform_config;

-- Confirm PK is now client_id
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'caiac' AND table_name = 'client_platform_config';

-- Confirm client_crm_configs exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'caiac' AND table_name = 'client_crm_configs';

-- Confirm ai_usage_log.client_id is now UUID
SELECT data_type FROM information_schema.columns
WHERE table_schema = 'caiac' AND table_name = 'ai_usage_log' AND column_name = 'client_id';
```
