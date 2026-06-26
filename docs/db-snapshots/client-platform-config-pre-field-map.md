# Snapshot: caiac.client_platform_config — pre field_map work

**Date:** 2026-06-25
**Queried via:** [Temp] Schema + Owner Emails (prod, workflow VE8vGWVUtGLFi9tp)

---

## Decision: use `intake_config` (no migration needed)

The plan originally called for `ADD COLUMN field_map JSONB`. After reviewing the live schema,
`intake_config JSONB` already exists and is semantically appropriate. The field_map and
status_values will be stored inside `intake_config`:

```json
{
  "field_map": { ... },
  "status_values": ["New", "Contacted", "Booked", "Completed", "Not Interested", "No Show"]
}
```

No ALTER TABLE migration needed.

---

## Current Schema

| Column | Type | Nullable | Default |
|---|---|---|---|
| `client_slug` | text | NOT NULL | — |
| `source_type` | text | NOT NULL | `'sheet'::text` |
| `google_review_link` | text | NOT NULL | — |
| `client_admin_email` | text | NOT NULL | — |
| `lead_sheet_id` | text | NOT NULL | — |
| `lead_sheet_tab` | text | NOT NULL | `'Leads'::text` |
| `link_signing_secret` | text | NOT NULL | — |
| `active` | boolean | NOT NULL | `true` |
| `created_at` | timestamptz | NOT NULL | `now()` |
| `updated_at` | timestamptz | NOT NULL | `now()` |
| `client_id` | uuid | NOT NULL | — |
| `enabled_features` | ARRAY | YES | `ARRAY['reviews'::text]` |
| `intake_config` | jsonb | YES | — |
| `next_sync_at` | timestamptz | YES | `now()` |
| `last_synced_at` | timestamptz | YES | — |
| `sync_backoff_until` | timestamptz | YES | — |

## Constraints

| Name | Type |
|---|---|
| `client_platform_config_pkey` | PRIMARY KEY (client_id) |
| `client_review_config_client_slug_fkey` | FOREIGN KEY |
| `fk_cpc_client` | FOREIGN KEY (client_id → caiac.clients.id) |

Note: PK was confirmed migrated to `client_id` on 2026-06-26 — `ON CONFLICT (client_slug)` failed, `ON CONFLICT ON CONSTRAINT client_platform_config_pkey` succeeded. cewall0 ran the migration.

---

## Existing rows (as of 2026-06-25)

| client_slug | client_id | lead_sheet_id | intake_config |
|---|---|---|---|
| henderson | 52161064-... | 1Zds_M-gVyKYGSk3ALOi1099vAgbvOOgoaLPwgHIlGiA | null |
| wallace-exterior | — | — | — (no row) |
| wallace-chemistry | — | — | — (no row) |
