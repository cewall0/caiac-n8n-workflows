# Plan: Lead Data Architecture — intake_data JSONB + CRM Wire-Up + Onboarding Consolidation

**Status: PLANNED**
**Date: 2026-06-22**

---

## Goal

Make the database the system of record for lead contact data, wire CRM sync into Lead Capture, and consolidate the onboarding sheet tooling. Right now lead fields only live in Google Sheets — if Sheets goes down, lead data is gone. CRM Create Lead exists in prod but is never called. Two separate sheet-creation workflows create fragmented setup. This plan fixes all three as one cohesive architecture change.

---

## Current State (What's Wrong)

### 1. Lead contact data is ephemeral
`caiac.leads` stores metadata only (`intake_fingerprint`, `qualification_score`, lifecycle). The actual lead — name, email, phone, service, custom fields — only exists in Google Sheets. No DB record = no API, no dashboard, no reporting, no recovery.

### 2. CRM sync is wired up wrong (or not at all)
`[Utility] CRM Create Lead v1.0.0` (`g7Gbsift1PZ085PH`) exists in prod and supports Pipedrive + Housecall Pro. It's never called. Current interface takes 7 flat params (`lead_name`, `lead_email`, `lead_phone`, `service`, `source_channel`, `client_id`, `crm_type`) — hard to extend to custom fields, and the caller has to know the CRM type. We'll fix both.

### 3. Sheet Append is hardcoded
`Append Lead to Sheet` in Lead Capture hardcodes column names (`name`, `email`, `phone`, `service`, etc.). If a client's `field_map` has custom columns ("Budget", "Property Address"), they never get written. Headers and row writes are out of sync for custom fields.

### 4. Sheet setup is split across two workflows
`[Onboarding] Create Lead Sheet v1.0.0` creates a leads sheet. `[Onboarding] Create Client Lead Sheet v1.0.0` creates a separate reviews sheet. Each produces its own file. There should be one sheet per client with two tabs.

### 5. `field_map` generation is informal
Agents generate `field_map` ad-hoc via `$fromAI()`. No artifact is produced for the operator to set up the Tally form with exactly matching labels. Drift between `field_map` keys and Tally labels silently breaks Lead Capture extraction.

---

## Architecture After This Plan

```
Tally Form
    │  (webhook, validated fields)
    ▼
[Intake] Lead Capture v2.1.0
    │
    ├── Extract Fields → build intake_data{} from field_map (one-line addition to existing loop)
    │
    ├── INSERT caiac.leads (intake_data JSONB, crm_external_id, crm_synced_at)
    │       RETURNING id  (already returned in current workflow)
    │
    ├── Append Lead to Sheet (dynamic row from intake_data{} + field_map labels)
    │
    └── Call [Utility] CRM Create Lead v1.0.0
            │  (client_id, lead_id)
            ├── reads intake_data from caiac.leads
            ├── reads crm config from caiac.client_crm_configs
            ├── routes to Pipedrive / HCP / Jobber
            └── UPDATEs caiac.leads.crm_external_id + crm_synced_at
```

```
Onboarding Agent
    │
    ├── generate_field_map    ← new tool (produces field_map + tally_fields list)
    ├── create_client         ← unchanged (receives field_map from step above)
    ├── create_user           ← unchanged
    ├── setup_client_sheet    ← replaces create_lead_sheet (one sheet, two tabs)
    ├── stub_crm_config       ← unchanged
    ├── send_welcome_email    ← unchanged
    ├── seed_features         ← unchanged
    └── smoke_test            ← unchanged
```

---

## Phase 1 — DB Migration (Needs cewall0)

This is both an add-columns and a cleanup pass. Don't add the new columns without removing the junk at the same time.

### Current `caiac.leads` columns and what's wrong

| Column | Current value | Problem |
|---|---|---|
| `crm_type` | always `'form'` | Misleading name — means intake source, not CRM target. `source_channel` already records this. Duplicate, confusing. Remove. |
| `source_id` | fingerprint hash | Identical to `intake_fingerprint`. Only exists to feed the old UNIQUE constraint. Remove. |
| `source_channel` | always `'form'` | Keep — this will vary when SMS intake ships (`'sms'`). |
| `lifecycle_stage` | always `'intake'` | Keep — will matter when leads move through stages. |
| `intake_fingerprint` | dedup hash | Keep — this IS the dedup key. |

### The UNIQUE constraint issue

The current ON CONFLICT clause is: `ON CONFLICT (client_id, crm_type, source_id)`. Removing `crm_type` and `source_id` requires replacing this constraint with `UNIQUE(client_id, intake_fingerprint)`. Verify the constraint name first:

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'caiac.leads'::regclass AND contype = 'u';
```

### Full migration SQL

```sql
-- 1. Add new columns
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS intake_data JSONB;
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_external_id TEXT;
ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_synced_at TIMESTAMPTZ;

-- 2. Replace UNIQUE constraint (verify constraint name first — see query above)
ALTER TABLE caiac.leads DROP CONSTRAINT leads_client_id_crm_type_source_id_key; -- adjust name as needed
ALTER TABLE caiac.leads ADD CONSTRAINT leads_client_fingerprint_unique UNIQUE (client_id, intake_fingerprint);

-- 3. Remove redundant columns (do LAST, after Lead Capture is updated to not reference them)
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_type;
ALTER TABLE caiac.leads DROP COLUMN IF EXISTS source_id;
```

**Run steps 1–2 first, deploy updated Lead Capture, then run step 3.** Don't drop columns while the old workflow is still writing to them.

### Column notes
- `intake_data JSONB` — full normalized lead payload keyed by system key: `{ "name": "John Smith", "email": "john@...", "service": "Roof repair" }`. Keys come from `field_map` values (right side). Nullable — historical leads will have NULL.
- `crm_external_id TEXT` — ID returned by the external CRM after sync (Pipedrive deal ID, HCP job ID). NULL = not synced.
- `crm_synced_at TIMESTAMPTZ` — timestamp of last successful CRM push.

### PII policy change — explicit sign-off required

The current Lead Capture sticky note says: **"PII boundary: name/email/phone in Sheet only — never in caiac.leads."** That was a deliberate choice.

Adding `intake_data JSONB` means name, email, and phone land in Postgres. This is the right call for system-of-record purposes, but it's a policy change. The VPS already stores `client_admin_email` and similar PII, so the environment is already handling it. Confirm before deploying.

---

## Phase 2 — New Onboarding Workflows

See sub-plans: `onboarding-field-map.md` and `onboarding-sheet-consolidation.md`. Summarized here with the additions discovered during full analysis.

### 2a. `[Onboarding] Generate Field Map v1.0.0` (new)

**Purpose:** Converts the agent's field collection step into a deterministic artifact. Produces `field_map` (stored in DB, drives sheet headers, drives Lead Capture extraction) and `tally_fields` (exact label list for the Tally form setup). Both artifacts come from the same computation — drift is structurally impossible.

**Inputs:** `fields` array of `{ label: string, required: boolean }`

**Outputs:**
```json
{
  "field_map": "{\"Full Name\": \"name\", \"Phone Number\": \"phone\"}",
  "tally_fields": ["Full Name", "Phone Number", "Email Address"],
  "required_fields": ["Full Name", "Phone Number"]
}
```

**Single Code node logic:**
- Lookup table for common labels → system keys (name, email, phone, address, service, notes, budget, city, zip, company, how_heard, challenge, business_type, business_name)
- Fallback: auto-slugify label to snake_case
- Validate ≥1 field, validate no duplicate labels
- `field_map` JSON string (not object) — matches how it's stored in `caiac.clients.config`

**Agent receives:** `field_map` (string) and `tally_fields` (array). Agent:
1. Stores the string in memory for the session
2. Shows `tally_fields` to operator: "Set up your Tally form with exactly these field labels: [list]"
3. Passes `field_map` to `create_client` and `setup_client_sheet`

### 2b. `[Onboarding] Setup Client Sheet v1.0.0` (new — replaces two workflows)

**Purpose:** One sheet per client, created in one shot. Tab 1 = "Lead Information" (auto-written by Lead Capture). Tab 2 = "Review Status" (client-managed; drives reviews workflow).

**Inputs:**
```
client_id          UUID
client_slug        string
client_name        string
owner_email        string
field_map          JSON string (from generate_field_map)
google_review_link string
```

**Steps:**
1. Validate `google_review_link` (HTTP GET → must 200) — abort before creating anything if invalid
2. Create spreadsheet titled `{client_name} - Leads`
3. Rename Sheet1 → "Lead Information"; write column headers from `field_map` keys (labels, not system keys)
4. Add "Review Status" tab; write fixed headers: `Lead Name | Email | Phone | Status | Notes | Review Link | Sent At | Rating`
5. Set data validation dropdown on Status column: `New | Called | Booked | Sent | Completed`
6. Protect header row (row 1) on both tabs — prevent accidental deletion
7. Share with `owner_email` (Editor)
8. Upsert to `caiac.clients`: update `config` JSONB to set `lead_capture.sheet_id` to the new `spreadsheetId`
9. Upsert to `caiac.client_platform_config`: write `client_slug`, `source_type='sheet'`, `google_review_link`, `client_admin_email` (= `owner_email`), `lead_sheet_id`, `lead_sheet_tab='Lead Information'`, `link_signing_secret` (generate fresh 64-char hex)
10. Return `{ sheet_id, sheet_url }`

**After cutover:** deactivate both:
- `[Onboarding] Create Lead Sheet v1.0.0` (`mXtKgZzK7Ppncywr`)
- `[Onboarding] Create Client Lead Sheet v1.0.0` (`WL6OUEmJ4Z5ZGsr8`)

### 2c. Update `[Onboarding] CAIAC Client Agent v1.0.0`

**Change the tool call order:**
```
OLD: create_client → create_user → create_lead_sheet → stub_crm_config → send_welcome_email → seed_features → smoke_test
NEW: generate_field_map → create_client → create_user → setup_client_sheet → stub_crm_config → send_welcome_email → seed_features → smoke_test
```

**Tool descriptor changes:**
- `generate_field_map`: new tool, full description in `onboarding-field-map.md`
- `create_client`: update description — `field_map` comes from `generate_field_map`, not `$fromAI`
- `create_lead_sheet` → `setup_client_sheet`: point to new workflow ID, update inputs (add `google_review_link`), update description
- All other tools: no change

**This is a full workflow update, not a version bump.** The agent workflow JSON changes but the name stays `v1.0.0`. No callers to break.

---

## Phase 3 — Update `[Utility] CRM Create Lead v1.0.0`

**Current interface:** `client_id, crm_type, lead_name, lead_email, lead_phone, service, source_channel` → `{ source_id, crm_type }`

**Problem:** Interface is field-specific, not scalable. Custom fields from `field_map` are lost. Caller must know `crm_type`. CRM doesn't get the full context.

**New interface:** `client_id, lead_id` → `{ crm_external_id, crm_type, skipped: bool }`

**How it works after the change:**

```
Trigger (client_id, lead_id)
    │
    ├── Check CRM Sync Feature (unchanged — checks caiac.client_features)
    │       ↓ disabled → Return Skipped (unchanged)
    │       ↓ enabled ↓
    │
    ├── Get Lead Intake Data (NEW)
    │   SELECT intake_data FROM caiac.leads WHERE id = $1::uuid AND client_id = $2::uuid
    │   Throws if not found or intake_data IS NULL
    │
    ├── Get CRM Config (MODIFIED)
    │   Remove crm_type param — query changes to:
    │   SELECT crm_type, pgp_sym_decrypt(...) AS api_key, crm_config - 'api_key_encrypted' AS config_meta
    │   FROM caiac.client_crm_configs
    │   WHERE client_id = $1::uuid AND active = true
    │   LIMIT 1
    │   (picks the active CRM; if client has none, Check Config Found throws)
    │
    ├── Validate Inputs (MODIFIED)
    │   Validate fields.name and fields.email exist (not crm_type parameter — it comes from DB now)
    │   Add Jobber to supported list if Jobber adapter added
    │
    ├── Route by CRM Type (unchanged — routes on crm_type from Get CRM Config result)
    │
    ├── [Pipedrive path] — MODIFIED to read from Get Lead Intake Data instead of trigger
    │   lead_name  = intake_data.name
    │   lead_email = intake_data.email
    │   lead_phone = intake_data.phone
    │   service    = intake_data.service || 'New Lead'
    │
    ├── [HCP path] — same modification
    │
    └── Format Output (MODIFIED)
        Returns { crm_external_id, crm_type }
        Plus NEW node: Update Lead CRM ID
        UPDATE caiac.leads
        SET crm_external_id = $1, crm_synced_at = NOW()
        WHERE id = $2::uuid
```

**Why `lead_id` instead of flat fields:**
- `intake_data JSONB` contains ALL intake data including custom fields — no need to enumerate them as params
- Future CRM adapters (Jobber, ServiceTitan, etc.) get full field access automatically
- Caller (Lead Capture) doesn't need to know what the CRM expects
- Adding a new field to `field_map` immediately makes it available to all CRM adapters
- Keeps the sub-workflow interface clean — two params, period

**No version bump needed** — this workflow has zero callers today. We can change its interface without breaking anything.

**Update sticky note** to reflect new interface and add Jobber as future-supported.

---

## Phase 4 — Update `[Intake] CAIAC Lead Capture v2.0.0` → v2.1.0

This is the largest single-workflow change. Touches 4 existing nodes and adds 3 new ones.

### Node 1: `Extract and Fingerprint Lead` (MODIFIED)

**Current behavior:** Already loops over `field_map` to build a `mapped` object, then outputs named flat keys (`name`, `email`, `phone`, etc.). The loop is already generic — the fix is minimal.

**New behavior:** also output `intake_data: mapped` alongside the existing named keys. No change to the fingerprint. No change to how individual keys like `name`, `email` are used downstream.

```javascript
// Add to the return object — everything else stays the same:
return [{ json: {
  // ... existing keys (name, email, phone, service, etc.)
  intake_data: mapped,   // ← add this: the full field_map extraction
  fingerprint,
} }];
```

All downstream nodes (`Score Lead`, `Build Follow-up Email`, `Build Owner Notification`) continue to reference the flat keys (`lead.name`, `lead.email`) — no changes needed there.

### Node 2: `Insert Lead to DB` (MODIFIED)

`RETURNING id AS lead_id` already exists in the current workflow — confirmed. The change is adding `intake_data` to the column list.

**Intermediate SQL** (use while `crm_type`/`source_id` still exist — deploy this first):
```sql
INSERT INTO caiac.leads
  (client_id, crm_type, source_id, source_channel, lifecycle_stage, intake_fingerprint,
   qualification_score, qualification_score_reason, intake_data)
VALUES
  (client_id::uuid, 'form', fingerprint, 'form', 'intake', fingerprint,
   score, reason, $N::jsonb)
ON CONFLICT (client_id, crm_type, source_id) DO UPDATE SET
  qualification_score        = EXCLUDED.qualification_score,
  qualification_score_reason = EXCLUDED.qualification_score_reason,
  intake_data                = EXCLUDED.intake_data
RETURNING id AS lead_id
```

**Final SQL** (after DB migration step 3 drops the redundant columns):
```sql
INSERT INTO caiac.leads
  (client_id, source_channel, lifecycle_stage, intake_fingerprint,
   qualification_score, qualification_score_reason, intake_data)
VALUES
  (client_id::uuid, 'form', 'intake', fingerprint, score, reason, $N::jsonb)
ON CONFLICT (client_id, intake_fingerprint) DO UPDATE SET
  qualification_score        = EXCLUDED.qualification_score,
  qualification_score_reason = EXCLUDED.qualification_score_reason,
  intake_data                = EXCLUDED.intake_data
RETURNING id AS lead_id
```

### Node 3: Handle resubmission (dedup path — MODIFIED)

The existing lead path (`Is Existing Lead → true`) routes to `Upsert Existing Lead to Sheet` then `Respond 200 Existing`. It does NOT update `intake_data` in DB. Add an `Update Lead Intake Data` Postgres node before the sheet upsert:

```sql
UPDATE caiac.leads
SET intake_data = $1::jsonb
WHERE intake_fingerprint = $2 AND client_id = $3::uuid
RETURNING id AS lead_id
```

This keeps DB current on resubmissions. The `lead_id` from RETURNING feeds the CRM step (same architecture as the new-lead path).

### Node 4: `Append Lead to Sheet` (MODIFIED)

**Current:** `mappingMode: "defineBelow"` with hardcoded column list (`Lead Name`, `Lead Email`, `Lead Phone`, `Address`, `Service`, `Business Name`, `Business Type`, `Challenge`, `Source`, `Score`, `Score Reason`, `Submitted At`, `Lead ID`, `Status`, `Source Ref`).

**New:** Insert a `Build Sheet Row` Code node before the Sheets node:

```javascript
const fieldMap = JSON.parse($('Get Client Config').first().json.field_map || '{}');
const intakeData = $('Extract and Fingerprint Lead').first().json.intake_data;
const scored = $('Score Lead').first().json;
const lead = $('Extract and Fingerprint Lead').first().json;
const leadId = $('Insert Lead to DB').first().json.lead_id;

const row = {};
// Dynamic columns from field_map (labels match sheet headers exactly)
for (const [label, systemKey] of Object.entries(fieldMap)) {
  row[label] = intakeData[systemKey] ?? '';
}
// Fixed trailing columns (always present regardless of field_map)
row['Status'] = '';
row['Notes'] = '';
row['Score'] = scored.qualification_score ?? '';
row['Score Reason'] = scored.qualification_score_reason ?? '';
row['Lead ID'] = leadId ?? '';
row['Submitted At'] = lead.submitted_at ?? '';
return [{ json: row }];
```

Then `Append Lead to Sheet` uses `mappingMode: "autoMapInputData"`.

**Tab 1 column layout (consolidated):** `[field_map labels] | Status | Notes | Score | Score Reason | Lead ID | Submitted At`

This matches the headers written by `Setup Client Sheet`. Custom fields land in custom columns. Fixed metadata columns always appear at the end. `Upsert Existing Lead to Sheet` needs the same treatment.

### Node 5: NEW — `Call CRM Create Lead` (Execute Workflow)

Add this node after `Insert Lead to DB` (and after `Update Lead Fields` on the resubmit path):

```
targetWorkflow: g7Gbsift1PZ085PH  (CRM Create Lead prod ID)
workflowInputs:
  client_id: {{ $('Get Client Config').first().json.client_id }}
  lead_id:   {{ $json.id }}  (from INSERT...RETURNING id)
```

Position: parallel to `Append Lead to Sheet` (both happen after DB insert, neither blocks the other).

**Error handling:** CRM Create Lead failure MUST NOT fail Lead Capture. Wrap in a try/catch via an Error path or use `continueOnFail: true` — the lead is in the DB and the sheet; a CRM sync failure is retryable. Alert via `[Utility] Handle Workflow Error` but let Lead Capture complete successfully.

### Node 6: NEW — `Handle CRM Result` (Code)

After `Call CRM Create Lead` returns, check result:

```javascript
const result = $input.first().json;
if (result.skipped) {
  return [{ json: { crm_synced: false, reason: result.reason } }];
}
return [{ json: { crm_synced: true, crm_external_id: result.crm_external_id, crm_type: result.crm_type } }];
```

Note: `CRM Create Lead` now handles the DB update itself (`crm_external_id`, `crm_synced_at`). This node is informational only — for logging or downstream conditional logic if needed.

### Version bump: Lead Capture becomes v2.1.0

Rename in n8n: `[Intake] CAIAC Lead Capture v2.1.0`. The webhook path stays identical — no frontend changes needed. The version bump signals the DB and CRM changes.

**Registry update:**
- Change file reference to `intake-lead-capture-v2.1.0.json`
- Old `intake-lead-capture-v2.0.0.json` stays in git as the rollback point (DO NOT delete before prod deploy)

---

## Phase 5 — Review Status DB Sync (Lower Priority, After Phase 4)

The Google Sheets "Review Status" tab stays as the client's interface. This phase adds DB sync so review status is also in the database for dashboards and reporting.

**DB migration (separate PR, separate migration):**
```sql
ALTER TABLE caiac.leads ADD COLUMN review_status TEXT;
-- Possible values: new | called | booked | sent | completed | NULL (not yet tracked)
-- note: review_sent_at and review_rating may already exist — verify before adding
```

**Workflow update: `[Reviews] Poll Sheets For Completed Leads v1.0.0`**

After reading `status = 'Booked'` from the sheet, also write to DB:
```sql
UPDATE caiac.leads
SET review_status = $1
WHERE intake_fingerprint = $2 AND client_id = $3
```

Where `intake_fingerprint` is derived from `email` in the sheet row (same LCG hash as Lead Capture).

**Do NOT build this in Phase 4.** The reviews system is working today. Phase 5 is additive (no behavior change, just DB writes) and can be done independently. Put this in OPEN_ITEMS after Phase 4 ships.

---

## Dependencies and Build Order

```
cewall0: DB migration (Phase 1)
    │
    ├──> Build Generate Field Map workflow (Phase 2a)
    │
    ├──> Build Setup Client Sheet workflow (Phase 2b)
    │       ← requires: read Create Client Lead Sheet to find review_config write target
    │
    ├──> Update CRM Create Lead (Phase 3)
    │       ← requires: DB migration (fields column must exist)
    │
    └──> Update Lead Capture v2.1.0 (Phase 4)
            ← requires: DB migration (fields, crm_external_id, crm_synced_at)
            ← requires: CRM Create Lead updated (new interface)
            
After phases 2a+2b done:
    └──> Update Onboarding Agent (Phase 2c)
            ← requires: generate_field_map and setup_client_sheet exist in staging
```

**Staging-only until all phases pass testing.**

---

## What `Create Client Lead Sheet` Actually Does (Blocker Resolved)

Writes to **`caiac.client_platform_config`** — a separate table, not `caiac.clients.config`. This is what the reviews system reads.

```sql
INSERT INTO caiac.client_platform_config
  (client_slug, source_type, google_review_link, client_admin_email, lead_sheet_id, lead_sheet_tab, link_signing_secret)
VALUES ($1, 'sheet', $2, $3, $4, $5, $6)
ON CONFLICT (client_slug) DO UPDATE SET ...
```

`link_signing_secret` = 64-char random hex, generated fresh at sheet creation. This is the HMAC secret used by `Sign Review Token` when generating review links. If we regenerate it on re-run, existing signed links break — the workflow is safe to re-run because it uses ON CONFLICT DO UPDATE, which does regenerate the secret. Note this in `Setup Client Sheet` — safe to re-run, but regenerates the signing secret.

**Tab 1 headers (hardcoded in current workflow):** `Lead Name | Lead Email | Lead Phone | Service | Status | Notes`
Status column = col E (index 4) — dropdown applied here.

**Tab 2 headers:** `Lead Email | Lead Phone | Review Email Sent | Review Email Sent Date | Rating Received | Needs Followup | Review Confirmed | Last Resend Date`

**`Setup Client Sheet` must write to TWO tables:**
1. `caiac.clients` — update `config->'lead_capture'->>'sheet_id'` (this is what Lead Capture reads)
2. `caiac.client_platform_config` — full upsert including `link_signing_secret`, `lead_sheet_tab = 'Lead Information'`, `google_review_link` (this is what Reviews reads)

**Tab 1 header structure in the consolidated workflow:**
Replace hardcoded `Lead Name | Lead Email | Lead Phone | Service | Status | Notes` with field_map-driven columns plus fixed trailing columns:
`[all field_map labels in order] | Status | Notes | Score | Score Reason | Lead ID | Submitted At`

The Status dropdown column index must be computed at runtime: `len(field_map)` = the Status column index (0-based). The generate_field_map output gives us the ordered label list.

**Separate sheets confirmed:** Lead Capture reads from `caiac.clients.config.lead_capture.sheet_id` (simple sheet from `Create Lead Sheet`). Reviews reads from `caiac.client_platform_config.lead_sheet_id` (different sheet from `Create Client Lead Sheet`). Clients currently have TWO sheets. The consolidation creates ONE sheet and updates both table references to point to it.

---

## Testing Checklist

### Phase 1 (after DB migration on staging)
- [ ] Verify `caiac.leads` has `fields`, `crm_external_id`, `crm_synced_at` columns
- [ ] Submit a test lead through existing Lead Capture — confirm it still works (new columns are nullable, no breakage)
- [ ] Verify `fields` is NULL for the test lead (expected — Lead Capture not yet updated)

### Phase 2 (onboarding workflows in staging)
- [ ] Call `generate_field_map` with a sample fields array — verify `field_map` string and `tally_fields` list output
- [ ] Run `setup_client_sheet` for a test client — verify one sheet with two tabs, correct headers on both, sharing works
- [ ] Check that `Poll Sheets For Completed Leads` can still read the Review Status tab (same structure as before)
- [ ] Run full onboarding agent flow for a new test client — verify all 8 tools fire in order

### Phase 3 (CRM Create Lead updated in staging)
- [ ] Call with valid `client_id` + `lead_id` (lead with non-null `fields`) — verify CRM record created
- [ ] Call with `crm_sync` feature disabled — verify `skipped: true` returned, no CRM call
- [ ] Call with no active `client_crm_configs` row — verify error thrown with clear message
- [ ] Verify `caiac.leads.crm_external_id` and `crm_synced_at` updated after successful push
- [ ] Test Pipedrive path: verify Person + Deal created
- [ ] Test HCP path: verify Customer + Job created

### Phase 4 (Lead Capture v2.1.0 in staging)
- [ ] Submit a test lead — verify `fields` column populated in `caiac.leads`
- [ ] Verify custom fields (non-standard field_map keys) appear as columns in the sheet
- [ ] Verify `crm_external_id` and `crm_synced_at` set on lead row after CRM sync
- [ ] Submit duplicate lead — verify resubmit path updates `fields` in DB
- [ ] Disable `crm_sync` feature for test client — verify CRM call skipped, lead capture still completes
- [ ] Force CRM Create Lead to fail — verify Lead Capture still completes (CRM failure is non-fatal)
- [ ] Run smoke test for CAIAC client — end-to-end form → DB → sheet → CRM

---

## Deploy Sequence (Prod)

**STOP: all staging tests must pass before any prod deploy.**

1. **DB migration** (cewall0 — needs direct Postgres access or maintenance window)
   - Two-commit pattern not applicable (schema change, not workflow)
   - Use `IF NOT EXISTS` guards
   - Verify on prod with `\d caiac.leads`

2. **CRM Create Lead** (update in place — no callers, no risk)
   - No snapshot needed (nothing calls it today)
   - `n8n_update_full_workflow` on prod → confirm

3. **New onboarding workflows** (create new, then update agent)
   - `n8n_create_workflow` for `generate_field_map` → get prod ID → update agent's tool definition
   - `n8n_create_workflow` for `setup_client_sheet` → get prod ID → update agent
   - `n8n_update_full_workflow` for agent (snapshot first)
   - Activate both new workflows
   - Test onboarding flow on prod with a real agent conversation

4. **Lead Capture v2.1.0**
   - Snapshot: `n8n_get_workflow` on `FXGmlYKi5Wy1QKX6` → save as `intake-lead-capture-v2.0.0.json` → commit "snapshot: Lead Capture v2.0.0 before v2.1.0 update"
   - Deploy: `n8n_update_full_workflow` on `FXGmlYKi5Wy1QKX6` → confirm
   - Post-deploy: save updated JSON → commit "sync: Lead Capture v2.1.0"
   - Submit a real test lead on the CAIAC Tally form → verify DB + sheet + CRM

5. **Deactivate old sheet workflows** (after onboarding agent verified on prod)
   - `n8n_deactivate_workflow` for `mXtKgZzK7Ppncywr` (Create Lead Sheet)
   - `n8n_deactivate_workflow` for `WL6OUEmJ4Z5ZGsr8` (Create Client Lead Sheet)
   - Update registry: status → `deactivated`
   - Remove `onboarding-create-lead-sheet-v1.0.0.json` and `onboarding-create-client-lead-sheet-v1.0.0.json` from `workflows/` (if they exist) in same commit

---

## Files Created / Updated

| File | Action |
|---|---|
| `workflows/onboarding-generate-field-map-v1.0.0.json` | Create after prod deploy |
| `workflows/onboarding-setup-client-sheet-v1.0.0.json` | Create after prod deploy |
| `workflows/onboarding-client-agent-v1.0.0.json` | Update (snapshot before, then update) |
| `workflows/intake-lead-capture-v2.0.0.json` | Snapshot (rollback point) |
| `workflows/intake-lead-capture-v2.1.0.json` | Create after prod deploy |
| `workflows/utility-crm-create-lead-v1.0.0.json` | Create after prod deploy |
| `workflows/README.md` | Update statuses, add new workflows, update Intake Calls list |
| `OPEN_ITEMS.md` | Add DB migration task, remove items resolved by this work |
| `.claude/plans/onboarding-field-map.md` | Mark IMPLEMENTED after deploy |
| `.claude/plans/onboarding-sheet-consolidation.md` | Mark IMPLEMENTED after deploy |
| This file | Mark IMPLEMENTED after all phases complete |

---

## What We Are NOT Building

- **Backfill of historical lead fields** — data only exists in Sheets, can't recover it. Historical leads will have `fields = NULL`. Accept this.
- **Multi-CRM per client** — one active CRM per client for now. The `LIMIT 1` in `Get CRM Config` enforces this. Future: `lead_crm_syncs` join table.
- **Jobber adapter** — `CRM Create Lead` currently supports Pipedrive + HCP. Add Jobber when a client needs it (follow same pattern as HCP).
- **Review Status tab → DB migration** — review tracking stays in Sheet as client interface. Phase 5 adds DB sync but is not part of this plan. Log in OPEN_ITEMS.
- **Tally API integration** — no public API for form creation. `tally_fields` output is shown to the operator manually.
- **Client dashboard leads view** — reading from `intake_data JSONB` for UI. This plan creates the data; the dashboard reads it in a separate effort.
- **CRM retry queue** — CRM failures are alerted but not auto-retried. Operator can re-trigger manually. Retry logic is future work.
