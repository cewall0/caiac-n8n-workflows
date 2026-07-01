# CAIAC Workflow Platform Architecture

**Last updated:** 2026-06-23
**Status:** Active — see Workflow Categories table for per-layer build status

---

## CAIAC Products

CAIAC Digital runs three separate products:

1. **Website** — marketing site
2. **Admin Dashboard** — internal operations, client management, analytics
3. **Client Portal** — clients log in to access RAG chat, health dashboard, workflow triggering

The `caiac.sessions` and `caiac.users` tables serve the client portal. Clients authenticate. Workflows triggerable from the portal must account for this entry path.

---

## What CAIAC Is

CAIAC Digital is an **automation layer**, not a CRM. It sits between lead channels (SMS, web, chat) and client CRMs (Pipedrive, Housecall Pro, Jobber), handling:

1. **Intake** — receive leads from any channel, store contact data, create them in the client's CRM
2. **Automation** — run workflows against leads over time (nurture, reviews, appointments)
3. **Reporting** — aggregate CAIAC-side outcome data into insights

CAIAC does not replace or compete with the client's CRM. The CRM remains the source of truth for deal stage and CRM-native fields. CAIAC owns the automation lifecycle and is the system of record for lead contact data collected through its intake channels.

**Key constraint:** Do not build a lead management grid for clients. CAIAC manages automations, not lead records.

---

## Data Boundaries

| System | Owns | Does NOT own |
|---|---|---|
| Client CRM | Deal stage, CRM-native fields, existing contact history | Automation outcomes |
| `caiac.leads` | Lead contact data (`intake_data JSONB`), automation state, outcomes | Nothing it doesn't need |
| `caiac.client_platform_config` | Client automation config, sheet IDs, signing secret | Lead data |
| Google Sheet | Client-facing lead view (Tab 1) + review status interface (Tab 2) | Source of truth (that's the DB) |

**PII policy (updated 2026-06-22):** Lead name, email, phone ARE stored in `caiac.leads.intake_data JSONB` as of Lead Capture v2.1.0. Original "no PII in DB" policy was reversed — the DB is the system of record; Google Sheets is the client interface. Compliance obligations documented in `docs/pii-and-compliance.md`.

---

## How Leads Enter CAIAC

### Path A — CAIAC Intake (CAIAC is the intake channel)

```
Channel event (form submit / SMS / chat message)
  → [Intake] * workflow
      → Parse + normalize lead fields via field_map
      → INSERT caiac.leads with intake_data JSONB    ← contact data stored here
      → [Utility] CRM Create Lead (client_id, lead_id)  ← creates record in client's CRM
          → reads intake_data from DB
          → writes crm_external_id + crm_synced_at back to caiac.leads
      → Append lead to Google Sheet                  ← client's working interface
      → Trigger immediate automation (follow-up email, owner notify)
```

CAIAC is the first system to receive this lead. CRM gets the record from us.

### Path B — CRM Sync (client has existing leads in CRM)

```
[Sync] CRM Type → caiac.leads  (every 15 min — NOT YET BUILT)
  → Fetch contacts/deals updated since last sync
  → Filter by qualifying stage (configurable per client)
  → Upsert caiac.leads with source_id, crm_type, lifecycle_stage
```

PII not stored for sync-sourced leads — only `source_id` and stage. PII fetched on-demand via `CRM Get Contact` when an automation runs.

### Path C — Google Sheets (no-CRM clients)

Already built. Sheet is source of truth for contact data. `caiac.leads` tracks automation state only for sheet clients. No CRM involved.

---

## Four-Layer Architecture

```
Layer 0 — CRM Sync (one per CRM type)
  [Sync] Pipedrive → caiac.leads         ← NOT BUILT (Step 5)
  [Sync] Housecall Pro → caiac.leads     ← NOT BUILT (Step 8)
  [Sync] Jobber → caiac.leads            ← NOT BUILT (Step 9)

Layer 1 — Trigger Adapters (source-specific)
  [Reviews] Poll Sheets For Completed Leads    ← BUILT (sheet clients)
  [Reviews] Poll DB For Completed Leads        ← NOT BUILT (CRM clients, Step 4)
  [Intake] CAIAC Lead Capture v2.0.0           ← BUILT (form; v2.1.0 planned — intake_data + CRM wire-up)
  [Intake] SMS Lead Capture                    ← NOT BUILT (Step 6)

Layer 2 — Core (source-agnostic)
  [Reviews] Process Completed Lead             ← BUILT
  [Reviews] Handle Rating Click                ← BUILT
  Future automation cores (nurture, appointments)

Layer 3 — Write-Back Utilities
  [Utility] Mark Review Sent      ← sheet branch BUILT; db branch NOT BUILT (Step 3)
  [Utility] Record Rating         ← sheet branch BUILT; db branch NOT BUILT (Step 3)
  [Utility] Update Lead Sheet Row ← BUILT
  [Utility] Update Lead DB Record ← NOT BUILT (Step 3)

CRM Adapter Layer (cross-cutting — used by all layers)
  [Utility] CRM Create Lead v1.0.0    ← BUILT (Pipedrive + HCP; interface changing to client_id + lead_id)
  [Utility] CRM Get Contact v1.0.0    ← NOT BUILT (Step 2; needed before reviews CRM path works)
  [Utility] CRM Update Contact v1.0.0 ← NOT BUILT (future, opt-in per client)
```

**Adding a new CRM:** Add one branch to each adapter utility. Zero changes anywhere else.

---

## CRM Target List

**Primary targets — trades/service vertical:**

| CRM | Auth | Gap CAIAC fills | Build order |
|---|---|---|---|
| **Pipedrive** | API key | Automation locked behind tiers 90% of users never reach | Step 2/5 |
| **Housecall Pro** | API key | Structurally no follow-up automation — operationally focused | Step 8 |
| **Jobber** | OAuth2 + GraphQL | Zero automation at any tier | Step 9 |

**Why these:** Service businesses finish a job and never ask for a review or chase the next lead. Revenue is real, pain is real, auth is simple for Pipedrive + HCP. One credential per client, build once.

**Jobber complexity:** GraphQL API + OAuth2 tokens. Store `refresh_token` encrypted in `crm_config`; adapter handles refresh. Charge more for Jobber onboarding.

---

## CRM Adapter Utilities

```
[Utility] CRM Create Lead v1.0.0  ← BUILT (g7Gbsift1PZ085PH)
  Current interface:  client_id, lead_id  (reads intake_data from caiac.leads)
  Output: { crm_external_id, crm_type, skipped: bool }
  → Checks crm_sync feature flag
  → Reads intake_data from caiac.leads WHERE id = lead_id
  → Lookup + decrypt API key from client_crm_configs
  → Branch on crm_type:
      pipedrive:      POST /persons + POST /deals
      housecall_pro:  POST /customers + POST /jobs
      jobber:         NOT YET — stub/400 (deferred — OAuth2 complexity)
  → Writes crm_external_id + crm_synced_at back to caiac.leads

[Utility] CRM Get Contact v1.0.0  ← NOT BUILT (Step 2)
  Input:  client_id, crm_type, source_id (crm_external_id from caiac.leads)
  Output: lead_name, lead_email, lead_phone, crm_metadata
  → Lookup + decrypt same pattern
  → Branch on crm_type
  → Returns normalized contact object
  Needed by: reviews DB path, nurture, any automation that needs lead PII for CRM-sync clients

[Utility] CRM Update Contact v1.0.0  ← NOT BUILT (future)
  Input:  client_id, crm_type, source_id, fields
  → Opt-in per client via crm_config.enable_crm_writeback
```

---

## DB Schema

### Live Tables (verified 2026-06-23)

| Table | Purpose | Notes |
|---|---|---|
| `caiac.clients` | Client registry | UUID PK |
| `caiac.client_platform_config` | Per-client platform config (renamed from `client_review_config`) | PK is `client_slug TEXT` — UUID migration not yet confirmed (see note below) |
| `caiac.client_crm_configs` | CRM credentials per client, encrypted | BUILT — pgcrypto, `CAIAC_ENCRYPTION_KEY` in env |
| `caiac.client_features` | Feature flags per client | BUILT |
| `caiac.users` | CAIAC + client portal users | UUID FK to clients |
| `caiac.sessions` | Auth sessions | UUID |
| `caiac.leads` | Lead ledger + contact data | See schema below — migration pending |
| `caiac.automation_runs` | One row per automation fired | BUILT |
| `caiac.error_log` | Workflow error log | BUILT |
| `caiac.ai_usage_log` | Token/cost tracking per workflow | `client_id` type: verify TEXT vs UUID |
| `caiac.documents` | RAG document index | UUID |
| `caiac.eval_jobs` | RAGAS eval results | UUID |
| `caiac.role_hierarchy` | Role visibility rules | No client scope |

**`client_platform_config` PK note:** Architecture originally planned to migrate PK from `client_slug TEXT` to `client_id UUID`. The live prod workflow (`Create Client Lead Sheet`) still uses `ON CONFLICT (client_slug)` — migration may not have run. Verify with cewall0 before assuming UUID PK.

**`ai_usage_log` note:** `client_id` column may still be TEXT. Verify before any UUID join query.

### `caiac.clients`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
slug            TEXT NOT NULL UNIQUE    -- URL handle / display label (not a FK target)
name            TEXT NOT NULL
webhook_secret  TEXT NOT NULL
jwt_secret      TEXT NOT NULL
config          JSONB NOT NULL DEFAULT '{}'
tier            TEXT NOT NULL DEFAULT 'starter'
active          BOOLEAN NOT NULL DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### `caiac.leads` — current prod + planned migration

**Current prod (pre-v2.1.0):**
```sql
id                         UUID PRIMARY KEY DEFAULT gen_random_uuid()
client_id                  UUID NOT NULL REFERENCES caiac.clients(id)
crm_type                   TEXT    -- always 'form' — REMOVING in migration
source_id                  TEXT    -- always fingerprint hash — REMOVING in migration
source_channel             TEXT    -- 'form' | 'sms' | 'chat'
lifecycle_stage            TEXT DEFAULT 'intake'
intake_fingerprint         TEXT    -- dedup hash (LCG of email)
qualification_score        NUMERIC
qualification_score_reason TEXT
created_at                 TIMESTAMPTZ DEFAULT now()
UNIQUE (client_id, crm_type, source_id)
```

**Post-migration (planned — needs cewall0):**
```sql
-- Added
intake_data      JSONB        -- full lead contact fields: { name, email, phone, service, ... }
crm_external_id  TEXT         -- Pipedrive deal ID / HCP job ID after CRM sync
crm_synced_at    TIMESTAMPTZ
-- Removed: crm_type, source_id (both were redundant)
-- Constraint: UNIQUE (client_id, intake_fingerprint)  replaces old constraint
```

Full migration SQL with sequencing in `.claude/plans/lead-data-architecture.md` Phase 1.

### `caiac.automation_runs`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
lead_id         UUID NOT NULL REFERENCES caiac.leads(id)
automation_type TEXT NOT NULL    -- 'review_request' | 'follow_up' | 'appointment_reminder'
state           TEXT DEFAULT 'pending'  -- pending → sent → responded → closed | failed
outcome         TEXT             -- 'good' | 'bad' | 'no_response' | 'booked'
metadata        JSONB
sent_at         TIMESTAMPTZ
responded_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```

### `caiac.client_crm_configs`

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
client_id   UUID NOT NULL REFERENCES caiac.clients(id)
crm_type    TEXT NOT NULL    -- 'pipedrive' | 'housecall_pro' | 'jobber'
crm_config  JSONB NOT NULL   -- { api_key_encrypted, pipeline_id, stage_id, ... }
active      BOOLEAN DEFAULT true
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
UNIQUE (client_id, crm_type)
```

Encrypted with pgcrypto (`pgp_sym_decrypt`). Master key is `CAIAC_ENCRYPTION_KEY` env var on VPS. See `docs/credential-encryption-spec.md` for per-CRM `crm_config` JSONB shape.

### `caiac.client_platform_config`

```sql
client_slug           TEXT PRIMARY KEY  (or UNIQUE — PK migration status unconfirmed)
source_type           TEXT DEFAULT 'sheet'
google_review_link    TEXT
client_admin_email    TEXT
lead_sheet_id         TEXT   -- Google Sheets spreadsheet ID
lead_sheet_tab        TEXT   -- always 'Lead Information'
link_signing_secret   TEXT   -- 64-char hex HMAC secret for review link signing
updated_at            TIMESTAMPTZ
```

Read by: `[Reviews] Poll Sheets For Completed Leads`, `[Utility] Get Client Review Config`, `[Utility] Sign Review Token`.
Written by: `[Onboarding] Create Client Lead Sheet v1.0.0` (current) → `[Onboarding] Setup Client Sheet v1.0.0` (planned).

---

## Canonical Data Shapes

Every utility workflow returns a normalized shape regardless of CRM. Consumer workflows never inspect `crm_type`.

**Contact shape** — from `intake_data JSONB` (intake path) or `[Utility] CRM Get Contact` (CRM sync path):
```json
{
  "lead_id":     "uuid",
  "client_id":   "uuid",
  "client_slug": "henderson",
  "crm_type":    "pipedrive",
  "source_id":   "crm-native-id",
  "lead_name":   "Jane Smith",
  "lead_email":  "jane@example.com",
  "lead_phone":  "+15551234567",
  "service":     "Kitchen Renovation"
}
```

**Automation trigger shape** — input to every automation workflow:
```json
{
  "lead_id":     "uuid",
  "client_id":   "uuid",
  "client_slug": "henderson",
  "source_type": "crm | sheet",
  "source_ref":  "crm_external_id OR sheet lead email",
  "lead_name":   "Jane Smith",
  "lead_email":  "jane@example.com",
  "service":     "Kitchen Renovation"
}
```

**Automation result shape** — written to `caiac.automation_runs`:
```json
{
  "lead_id":         "uuid",
  "automation_type": "review_request | follow_up | appointment_reminder",
  "state":           "sent | failed | skipped",
  "outcome":         "good | bad | booked | no_response | null",
  "metadata":        {}
}
```

---

## Cross-Compatibility

`caiac.leads` is the single handoff point. Any lead from any source lands there with the same shape. Any automation reads from it without knowing the lead's origin.

```
Intake Form ──┐
Intake SMS  ──┤
CRM Sync    ──┼──→ caiac.leads ──→ Review Request
Sheet Poll  ──┤                ──→ Nurture Sequence
Manual      ──┘                ──→ Appointment Reminder
                               ──→ Any future automation
```

---

## Multi-Tenancy

**Single table, `client_id` UUID column on every row.** No per-client schemas.

- DB queries always filter `WHERE client_id = $1`
- `client_id` is passed explicitly as input to every workflow — never inferred
- `client_slug` is carried alongside for logging/display only
- CRM credentials per-client: stored in `caiac.client_crm_configs`, encrypted with pgcrypto
- RLS available as a future layer if clients ever need direct DB access

---

## Workflow Categories

| Category | Examples | Status |
|---|---|---|
| Intake | Lead Capture v2.0.0 (form) | Partial — form built; v2.1.0 (intake_data + CRM wire-up) planned; SMS future |
| Onboarding | Client Agent, Create Client Record, Create User, Setup Sheet, Seed Features, Smoke Test | Mostly built; Generate Field Map + Setup Client Sheet planned |
| Reviews | Poll Sheets, Process Lead, Handle Click, Review Utilities | Built (sheet path only); DB/CRM path not built |
| Nurture | Auto-reply, No-response follow-up, Re-engagement | Not built |
| Appointments | Booking confirmation, Reminders, No-show | Not built |
| Reporting | Weekly digest, RAG analytics | Not built |
| Admin | Update Client Config, List Clients, Ingest, Eval, Health checks | Mostly built; Offboard Client not built |
| Auth | Signin, Refresh, Signout, Change Password, Full Auth | Built |
| Chat / RAG | Chat v2.4.1 (pending deactivate), v2.5.0 (active), History, Messages, Delete, Promote, Dismiss | Built; v2.5.0 cutover pending |
| Utility | Score Lead, CRM Create Lead, Send Email, Handle Error, Review utilities | Mostly built; CRM Get Contact + Update Lead DB Record not built |
| Scheduled | Nightly Cleanup | Built |

---

## Scaling Considerations

### Execution Concurrency
Poll workflows fan-out to per-client child executions at ~15 clients. Parent fetches client list and fires independent child executions — no sequential loops. **Fan-out refactor not yet built** — current implementation is sequential and will need updating at scale.

### CRM API Rate Limiting
`next_sync_at` + `sync_backoff_until` on `client_platform_config`. CRM adapter detects HTTP 429 → writes backoff timestamp → exits cleanly. Per-client credentials isolate rate limits.

### Centralized Error Handling
All Error Trigger nodes point to `[Utility] Handle Workflow Error v1.0.0` (`hZk1sE4UP2Vmn5QV`). Writes to `caiac.error_log`, alerts CAIAC admin.

### Intake Deduplication
Fingerprint hash of email checked against `caiac.leads.intake_fingerprint` before inserting. `ON CONFLICT (client_id, intake_fingerprint) DO UPDATE` handles double-submits and Telnyx SMS retries.

### Client Offboarding
`[Admin] Offboard Client v1.0.0` — **not built.** When built: sets `active = FALSE`, marks open leads `lifecycle_stage = offboarded`. Nothing deleted. Reactivation is `active = TRUE`.

### Queue Mode Readiness
No `$getWorkflowStaticData()`, no filesystem writes, all state in Postgres, webhooks stateless. No code changes needed when switching to queue mode — enforced as a build constraint.

---

## Infrastructure Reference

| Resource | Value |
|---|---|
| n8n staging | `https://flows-staging.caiacdigital.com` |
| n8n prod | `https://flows.caiacdigital.com` |
| Postgres credential (staging) | `CAIAC Postgres` (`BvWEZQzIRXye00Gp`) |
| Postgres credential (prod) | `CAIAC Postgres` (`oJ321kQrsEmHydiQ`) |
| Sheets credential | `Caiac Group Sheets` (`aZpl46gLl1Uha2wW`) |
| Email sub-workflow | `[Utility] Send Email v1.0.0` (`tdI7VopcP5vpet6J`) — SendGrid |
| Review webhook | `https://flows.caiacdigital.com/webhook/review-rating` |

**All email** routes through `[Utility] Send Email v1.0.0`. Never call SendGrid directly from a workflow.

### Key Prod Workflow IDs
| Workflow | ID |
|---|---|
| `[Intake] CAIAC Lead Capture v2.0.0` | `FXGmlYKi5Wy1QKX6` |
| `[Onboarding] CAIAC Client Agent v1.0.0` | `HdNvh02lpP6dV059` |
| `[Utility] CRM Create Lead v1.0.0` | `g7Gbsift1PZ085PH` |
| `[Utility] Full Auth v2.0.0` | `XWbmBI9NYdwK80eg` |
| `[Utility] Handle Workflow Error v1.0.0` | `hZk1sE4UP2Vmn5QV` |
| `[Utility] Send Email v1.0.0` | `tdI7VopcP5vpet6J` |
| `[Reviews] Poll Sheets For Completed Leads v1.0.0` | `rsuysKkzQZ3Muse2` |
| `[Reviews] Process Completed Lead v1.0.0` | `9TiCOFBEFCksLWyM` |
| `[Reviews] Handle Rating Click v1.0.0` | `XSQemRjTkLP0D15x` |
| Full registry → `workflows/README.md` | — |

---

## Active Work (as of 2026-06-23)

See `OPEN_ITEMS.md` for the full list. Key items in flight:

**Blocked on cewall0:**
- `caiac.leads` schema migration (intake_data, crm_external_id, crm_synced_at; remove source_id + crm_type; replace UNIQUE constraint)
- `client_platform_config` PK migration status — verify whether slug→UUID migration ran

**Staging builds (after DB migration):**
1. `[Onboarding] Generate Field Map v1.0.0` — new agent tool
2. `[Onboarding] Setup Client Sheet v1.0.0` — replaces two sheet workflows; writes to both `caiac.clients.config` and `caiac.client_platform_config`
3. Update `[Onboarding] CAIAC Client Agent v1.0.0`
4. Update `[Utility] CRM Create Lead v1.0.0` — new interface (client_id + lead_id)
5. `[Intake] CAIAC Lead Capture v2.1.0` — intake_data write, dynamic sheet append, CRM wire-up
6. PII compliance items (execution log setting, privacy policy, DPA, retention job)

**Near-term (after v2.1.0 ships):**
- Chat v2.5.0 cutover → deactivate v2.4.1
- Chat v2.5.0 rate limiting
- CAIAC Tally form + smoke test

---

## Build Order (Full Backlog)

Steps 0–4 are complete. Remaining:

| Step | What | Trigger / Notes |
|---|---|---|
| 5 | `caiac.leads` migration + Lead Capture v2.1.0 | Blocked on DB migration (cewall0) |
| 6 | `[Utility] CRM Get Contact v1.0.0` — Pipedrive + HCP branches | Before reviews DB path works |
| 7 | DB write-back branches in Mark Review Sent + Record Rating; `[Utility] Update Lead DB Record v1.0.0` | Before CRM clients can use reviews |
| 8 | `[Reviews] Poll DB For Completed Leads v1.0.0` | Before first CRM client is live |
| 9 | `[Sync] Pipedrive → caiac.leads v1.0.0` | First paying Pipedrive client |
| 10 | `[Intake] SMS Lead Capture v1.0.0` (Telnyx) | After Telnyx number acquired |
| 11 | Fan-out refactor for Poll Sheets + Poll DB | ~15 clients |
| 12 | `[Admin] Offboard Client v1.0.0` | Before first client churn |
| 13 | Housecall Pro branches in all adapters + `[Sync] HCP → caiac.leads v1.0.0` | First HCP client |
| 14 | Jobber branches (OAuth2 + GraphQL) + `[Sync] Jobber → caiac.leads v1.0.0` | Dedicated sprint; charge extra for onboarding |
| 15 | Nurture, Appointment, Reporting workflows | After intake live with multiple clients |

---

## What Is NOT Changing

- Poll Sheets, Update Lead Sheet Row — sheet path unchanged
- Process Completed Lead, Handle Rating Click, Sign Review Token — source-agnostic, no changes
- Sheet-based clients (Henderson, etc.) — unaffected by CRM work
- Review outcomes are NOT written back to CRM — stored in `caiac.automation_runs` only
- CRM write-back (`CRM Update Contact`) is future and opt-in per client
