# CAIAC Workflow Platform Architecture

**Last updated:** 2026-06-17  
**Status:** Approved design — not yet fully implemented  
**Plan file:** `C:\Users\lsgra\.claude\plans\humble-yawning-stearns.md`

---

## What CAIAC Is

CAIAC Digital is an **automation layer**, not a CRM. It sits between lead channels (SMS, web, chat) and client CRMs (GoHighLevel, HubSpot, Zoho), handling:

1. **Intake** — receive leads from any channel, create them in the client's CRM
2. **Automation** — run workflows against leads over time (nurture, reviews, appointments)
3. **Reporting** — aggregate CAIAC-side outcome data into insights

CAIAC does not replace or compete with the client's CRM. The CRM remains the source of truth for contact data. CAIAC owns the automation lifecycle.

**Key constraint:** Do not build a lead management grid for clients. CAIAC manages automations, not lead records.

---

## Data Boundaries

| System | Owns | Does NOT own |
|---|---|---|
| Client CRM | Lead name, email, phone, deal stage (PII) | Automation outcomes |
| `caiac.leads` | Lead ID (non-PII), automation state, outcomes | Contact details |
| `caiac.client_review_config` | Client automation config | Lead data |
| Google Sheet | Lead data for no-CRM clients | Anything CRM-side |

**PII policy:** Lead name, email, phone are fetched from the CRM when needed, passed in-flight, never stored in CAIAC's DB.

---

## How Leads Enter CAIAC

### Path A — CAIAC Intake (CAIAC is the intake channel)

```
Channel event (SMS / form submit / chat message)
  → [Intake] * workflow
      → Parse + normalize lead info
      → [Utility] CRM Create Lead     ← creates contact in client's CRM
      → [Utility] CRM Get Contact     ← fetches back the assigned source_id
      → Upsert caiac.leads            ← records lead in CAIAC ledger
      → Trigger immediate automation  ← e.g. auto-reply, assignment notification
```

CAIAC is the first system to receive this lead. CRM gets the record from us.

### Path B — CRM Sync (client has existing leads in CRM)

```
[Sync] CRM Type → caiac.leads  (every 15 min)
  → Fetch contacts/deals updated since last sync
  → Filter by qualifying stage (configurable per client)
  → Upsert caiac.leads with source_id, crm_type, lifecycle_stage
```

No PII stored — only source_id and stage. PII fetched on-demand when an automation runs.

### Path C — Google Sheets (no-CRM clients)
Already built. Sheets is the source of truth. No CRM involved.

---

## Four-Layer Architecture

```
Layer 0 — CRM Sync (one per CRM type)
  [Sync] GoHighLevel → caiac.leads       ← every 15 min or webhook
  [Sync] HubSpot → caiac.leads
  [Sync] Zoho → caiac.leads

Layer 1 — Trigger Adapters (source-specific)
  [Reviews] Poll Sheets For Completed Leads    ← sheet clients (built)
  [Reviews] Poll DB For Completed Leads        ← CRM clients (not built)
  [Intake] SMS / Form / Chat                   ← CAIAC-captured leads (future)

Layer 2 — Core (source-agnostic)
  [Reviews] Process Completed Lead             ← built
  [Reviews] Handle Rating Click                ← built
  Future automation cores

Layer 3 — Write-Back Utilities
  [Utility] Mark Review Sent      ← sheet branch (built) + db branch (not built)
  [Utility] Record Rating         ← sheet branch (built) + db branch (not built)
  [Utility] Update Lead Sheet Row ← sheet only (built)
  [Utility] Update Lead DB Record ← not built

CRM Adapter Layer (cross-cutting — used by all layers)
  [Utility] CRM Create Lead    ← new lead → client CRM (not built)
  [Utility] CRM Get Contact    ← fetch PII from CRM (not built)
  [Utility] CRM Update Contact ← future, opt-in per client
```

**Adding a new CRM:** Add one branch to each adapter utility. Zero changes anywhere else.

---

## CRM Adapter Utilities

```
[Utility] CRM Create Lead v1.0.0
  Input:  client_id, lead_name, lead_email, lead_phone, service, source_channel
  Output: source_id (CRM's assigned ID for the new record)
  → Branches on crm_type → GHL / HubSpot / Zoho
  → Returns normalized { source_id }

[Utility] CRM Get Contact v1.0.0
  Input:  client_id, source_id
  Output: lead_name, lead_email, lead_phone, crm_metadata
  → Branches on crm_type
  → Returns normalized contact object

[Utility] CRM Update Contact v1.0.0  (future)
  Input:  client_id, source_id, fields
  → Opt-in per client via crm_config.enable_crm_writeback
```

---

## DB Schema

### Existing Tables (live as of 2026-06-17)

| Table | Purpose | client_id type |
|---|---|---|
| `caiac.clients` | Client registry | — (is the id) |
| `caiac.client_review_config` | Per-client automation config | TEXT slug (migrating to UUID) |
| `caiac.users` | CAIAC + client users | UUID |
| `caiac.sessions` | Auth sessions | UUID |
| `caiac.documents` | RAG document index | UUID |
| `caiac.audit_log` | Security audit trail | UUID |
| `caiac.ai_usage_log` | Token/cost tracking | TEXT ⚠️ inconsistent — should be UUID |
| `caiac.eval_jobs` | RAGAS eval results | UUID |
| `caiac.role_hierarchy` | Role visibility rules | — (no client scope) |

**Note on `ai_usage_log`:** `client_id` is `TEXT` while every other table uses `UUID`. Flag for your dad — worth aligning in a future migration.

### `caiac.clients` — live schema ✓

```sql
-- Already correct — UUID PK built from the start
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
slug            TEXT NOT NULL          -- URL handle / display label (not a FK target)
name            TEXT NOT NULL
webhook_secret  TEXT NOT NULL
jwt_secret      TEXT NOT NULL
config          JSONB NOT NULL DEFAULT '{}'
tier            TEXT NOT NULL DEFAULT 'starter'
active          BOOLEAN NOT NULL DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### `caiac.leads` — automation ledger (not a CRM mirror)

```sql
CREATE TABLE caiac.leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES caiac.clients(id),
  crm_type              TEXT NOT NULL,   -- 'ghl' | 'hubspot' | 'zoho' | 'sheet' | 'manual'
  source_id             TEXT NOT NULL,   -- CRM's ID (non-PII)
  source_channel        TEXT,            -- 'sms' | 'form' | 'chat' | 'crm_sync' | 'sheet'
  service               TEXT,
  lifecycle_stage       TEXT DEFAULT 'intake', -- intake → active → completed → closed
  intake_fingerprint    TEXT,            -- dedup hash for intake workflows
  next_action_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, crm_type, source_id)
);

CREATE INDEX idx_leads_fingerprint ON caiac.leads (intake_fingerprint)
  WHERE intake_fingerprint IS NOT NULL;
```

### `caiac.automation_runs` — one row per automation fired

```sql
CREATE TABLE caiac.automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID NOT NULL REFERENCES caiac.leads(id),
  automation_type TEXT NOT NULL,   -- 'review_request' | 'follow_up' | 'appointment_reminder' | ...
  state           TEXT DEFAULT 'pending', -- pending → sent → responded → closed | failed
  outcome         TEXT,            -- 'good' | 'bad' | 'no_response' | 'booked' | ...
  metadata        JSONB,
  sent_at         TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### `caiac.error_log`

```sql
CREATE TABLE caiac.error_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug   TEXT,
  workflow_name TEXT,
  node_name     TEXT,
  error_message TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### `caiac.client_review_config` — columns to add

```sql
ALTER TABLE caiac.client_review_config
  ADD COLUMN client_id       UUID REFERENCES caiac.clients(id),  -- backfill from slug, then make PK
  ADD COLUMN crm_type        TEXT,
  ADD COLUMN crm_config      JSONB,     -- { credential_name, pipeline_id, trigger_stage, intake_number }
  ADD COLUMN intake_config      JSONB,   -- { sms_number, form_webhook_path, auto_reply_template }
  ADD COLUMN enabled_features   TEXT[];  -- ['reviews', 'nurture', 'appointments'] — controls which tabs exist and which automations run
  ADD COLUMN next_sync_at    TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN last_synced_at  TIMESTAMPTZ,
  ADD COLUMN sync_backoff_until TIMESTAMPTZ;
```

---

## Canonical Data Shapes

Every utility workflow returns a normalized shape regardless of CRM. Consumer workflows never inspect `crm_type`.

**Contact shape** — output of `[Utility] CRM Get Contact` and all intake workflows:
```json
{
  "lead_id":     "uuid",
  "client_id":   "uuid",
  "client_slug": "henderson",
  "crm_type":    "ghl",
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
  "source_ref":  "crm source_id OR sheet lead email",
  "lead_name":   "Jane Smith",
  "lead_email":  "jane@example.com",
  "service":     "Kitchen Renovation"
}
```

**Automation result shape** — written to `caiac.automation_runs`:
```json
{
  "lead_id":        "uuid",
  "automation_type": "review_request | follow_up | appointment_reminder | ...",
  "state":          "sent | failed | skipped",
  "outcome":        "good | bad | booked | no_response | null",
  "metadata":       {}
}
```

---

## Cross-Compatibility

`caiac.leads` is the single handoff point. Any lead from any source lands there with the same shape. Any automation reads from it without knowing the lead's origin.

```
Intake SMS  ──┐
Intake Form ──┤
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
- CRM credentials per-client: stored in n8n Credentials Manager, name from `crm_config.credential_name`
- RLS available as a future layer if clients ever need direct DB access

---

## Workflow Categories

| Category | Examples | Status |
|---|---|---|
| Intake | SMS Capture, Web Form, Chat Widget | Future |
| Nurture | Auto-reply, No-response follow-up, Re-engagement | Future |
| Reviews | Poll Sheets, Poll DB, Process Lead, Handle Click | Built (sheet path) |
| Appointments | Booking confirmation, Reminders, No-show | Future |
| Reporting | Weekly digest, RAG text-to-SQL analytics | Future |
| Admin | Offboard Client, Handle Workflow Error | Future |

---

## Scaling Considerations

### Execution Concurrency
Poll workflows fan-out to per-client child executions at 15+ clients. Parent fetches client list and fires independent child executions — no sequential loops.

### CRM API Rate Limiting
`next_sync_at` + `sync_backoff_until` on `client_review_config`. CRM adapter detects HTTP 429 → writes backoff timestamp → exits cleanly. Per-client credentials isolate rate limits.

### Centralized Error Handling
All Error Trigger nodes point to `[Utility] Handle Workflow Error v1.0.0`. Writes to `caiac.error_log`, sends Slack/email to CAIAC admin. One utility covers all current and future workflows.

### Intake Deduplication
Fingerprint hash from `(client_id + phone/email + source_channel)` checked before CRM Create Lead. 24-hour window indexed on `caiac.leads.intake_fingerprint`. Handles form double-submits and Twilio retries.

### Client Offboarding
`[Admin] Offboard Client v1.0.0` — sets `active = FALSE`, marks open leads `lifecycle_stage = offboarded`. Nothing deleted. Reactivation is `active = TRUE`.

### Queue Mode Readiness
No `$getWorkflowStaticData()`, no filesystem writes, all state in Postgres, webhooks stateless. No code changes needed — enforced as a build constraint.

---

## `client_review_config` FK Migration

See [docs/caiac-clients-uuid-migration.md](caiac-clients-uuid-migration.md) for the full SQL.

`caiac.clients` already has `id UUID PRIMARY KEY` — no work needed there. The migration only touches `client_review_config`: add `client_id UUID FK`, backfill from slug join, swap PK, add platform expansion columns. Run before building `caiac.leads`.

---

## Infrastructure Reference

| Resource | Value |
|---|---|
| n8n URL | `https://flows.caiacdigital.com` |
| Postgres credential | `CAIAC Postgres` (`oJ321kQrsEmHydiQ`) |
| Sheets credential | `Caiac Group Sheets` (`aZpl46gLl1Uha2wW`) |
| Email credential | `SendGrid API` (`V2oX0Dl2H30bjEdO`) |
| Review webhook | `https://flows.caiacdigital.com/webhook/review-rating` |

### Existing Review System Workflow IDs
| ID | Workflow |
|----|----------|
| `WL6OUEmJ4Z5ZGsr8` | [Onboarding] Create Client Lead Sheet v1.0.0 |
| `rsuysKkzQZ3Muse2` | [Reviews] Poll Sheets For Completed Leads v1.0.0 |
| `9TiCOFBEFCksLWyM` | [Reviews] Process Completed Lead v1.0.0 |
| `XSQemRjTkLP0D15x` | [Reviews] Handle Rating Click v1.0.0 |
| `qicDCvaDemfb9gdw` | [Reviews] Check Review Link Health v1.0.0 |
| `D7eHaKwQCqYLbjlh` | [Utility] Get Client Review Config v1.0.0 |
| `O60CFCYZdAGLXZkW` | [Utility] Sign Review Token v1.0.0 |
| `ySf9npJlqi23yjXK` | [Utility] Update Lead Sheet Row v1.0.0 |
| `zHqk2CNsXQX6K1Bn` | [Utility] Mark Review Sent v1.0.0 |
| `eQeYbCkCLYaNvG83` | [Utility] Record Rating v1.0.0 |
| `tdI7VopcP5vpet6J` | [Utility] Send Email v1.0.0 (SendGrid) |

---

## Build Order

**Step 0 — DB Foundation**
- `caiac.clients` UUID PK migration
- Create `caiac.leads`, `caiac.automation_runs`, `caiac.error_log`
- Add new columns to `caiac.client_review_config`

**Step 1 — Error Infrastructure**
- `[Utility] Handle Workflow Error v1.0.0`
- All new workflows from here get an Error Trigger node pointing to it

**Step 2 — CRM Adapter Utilities (GHL stubs)**
- `[Utility] CRM Create Lead v1.0.0`
- `[Utility] CRM Get Contact v1.0.0`

**Step 3 — DB Write-Back**
- `db` branch in `Mark Review Sent` + `Record Rating` → writes to `automation_runs`
- `[Utility] Update Lead DB Record v1.0.0`

**Step 4 — DB Poll Path (end-to-end test, no real CRM needed)**
- `[Reviews] Poll DB For Completed Leads v1.0.0`

**Step 5 — GoHighLevel**
- `[Sync] GoHighLevel → caiac.leads v1.0.0`
- Onboard first GHL client

**Step 6 — First Intake**
- `[Intake] SMS Lead Capture v1.0.0` (Twilio → GHL)

**Step 7 — Fan-Out Refactor** (at ~15 clients)
- Refactor Poll Sheets + Poll DB to parent/child fan-out pattern

**Step 8 — HubSpot**
- HubSpot branches in all adapter utilities + `[Sync] HubSpot → caiac.leads`

**Step 9 — Zoho**
- Zoho branches in all adapter utilities + `[Sync] Zoho → caiac.leads`

**Step 10 — Nurture, Appointments, Reporting**
- After intake is live and `caiac.leads` has real data

---

## What Is NOT Changing

- Poll Sheets, Update Lead Sheet Row, Onboarding — sheet path unchanged
- Process Completed Lead, Handle Rating Click, Sign Review Token — source-agnostic, unchanged
- Henderson and existing sheet clients — unaffected
- Review outcomes are NOT written back to CRM — stored in `caiac.automation_runs` only
- CRM write-back (`CRM Update Contact`) is future and opt-in per client
