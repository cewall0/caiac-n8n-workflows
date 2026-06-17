# `client_review_config` — Add client_id FK Migration

**Status:** Not yet run  
**Verified:** `caiac.clients.id UUID` already exists as PK (confirmed from live schema 2026-06-17)  
**Must run before:** Building `caiac.leads` or any new table that FKs to `caiac.clients`

---

## What's Already Done

`caiac.clients` was built with `id UUID PRIMARY KEY` from the start. Full live schema:

```
caiac.clients
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  slug            TEXT NOT NULL          ← URL handle / display label
  name            TEXT NOT NULL
  webhook_secret  TEXT NOT NULL
  jwt_secret      TEXT NOT NULL
  config          JSONB NOT NULL DEFAULT '{}'
  tier            TEXT NOT NULL DEFAULT 'starter'
  active          BOOLEAN NOT NULL DEFAULT true
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

No migration needed on `clients`.

---

## What Still Needs Migrating

`caiac.client_review_config` currently uses `client_slug TEXT` as its primary key with no UUID FK to `clients`. Live schema:

```
caiac.client_review_config
  client_slug         TEXT NOT NULL    ← current PK (to be demoted)
  source_type         TEXT NOT NULL DEFAULT 'sheet'
  google_review_link  TEXT NOT NULL
  client_admin_email  TEXT NOT NULL
  lead_sheet_id       TEXT NOT NULL
  lead_sheet_tab      TEXT NOT NULL DEFAULT 'Leads'
  link_signing_secret TEXT NOT NULL
  active              BOOLEAN NOT NULL DEFAULT true
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## Migration SQL

Run as a single transaction.

```sql
BEGIN;

-- 1. Add client_id UUID FK column
ALTER TABLE caiac.client_review_config
  ADD COLUMN client_id UUID;

-- 2. Backfill from slug join (safe — slug is UNIQUE on clients)
UPDATE caiac.client_review_config crc
SET client_id = c.id
FROM caiac.clients c
WHERE c.slug = crc.client_slug;

-- 3. Lock NOT NULL and add FK constraint
ALTER TABLE caiac.client_review_config
  ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE caiac.client_review_config
  ADD CONSTRAINT fk_crc_client
  FOREIGN KEY (client_id) REFERENCES caiac.clients(id);

-- 4. Swap PK from client_slug to client_id
ALTER TABLE caiac.client_review_config
  DROP CONSTRAINT client_review_config_pkey;

ALTER TABLE caiac.client_review_config
  ADD CONSTRAINT client_review_config_pkey PRIMARY KEY (client_id);

-- 5. Add platform expansion columns
ALTER TABLE caiac.client_review_config
  ADD COLUMN crm_type           TEXT,
  ADD COLUMN crm_config         JSONB,
  ADD COLUMN intake_config      JSONB,
  ADD COLUMN enabled_features   TEXT[] DEFAULT ARRAY['reviews'],
  ADD COLUMN next_sync_at       TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN last_synced_at     TIMESTAMPTZ,
  ADD COLUMN sync_backoff_until TIMESTAMPTZ;

-- NOTE: Leave client_slug column in place until all workflows carry client_id.
-- Drop it in a follow-up migration after workflows are updated.

COMMIT;
```

---

## After Migration

```
caiac.client_review_config
  client_id           UUID PRIMARY KEY → caiac.clients(id)
  client_slug         TEXT             ← keep temporarily, drop after workflow updates
  source_type         TEXT DEFAULT 'sheet'
  google_review_link  TEXT
  client_admin_email  TEXT
  lead_sheet_id       TEXT
  lead_sheet_tab      TEXT DEFAULT 'Leads'
  link_signing_secret TEXT
  active              BOOLEAN DEFAULT true
  crm_type            TEXT             ← 'ghl' | 'hubspot' | 'zoho' | null
  crm_config          JSONB            ← { credential_name, pipeline_id, trigger_stage }
  intake_config       JSONB            ← { sms_number, form_webhook_path }
  enabled_features    TEXT[]           ← ['reviews', 'nurture', 'appointments']
  next_sync_at        TIMESTAMPTZ
  last_synced_at      TIMESTAMPTZ
  sync_backoff_until  TIMESTAMPTZ
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ
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
SELECT client_slug, client_id FROM caiac.client_review_config;

-- Confirm PK is now client_id
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'caiac' AND table_name = 'client_review_config';
```
