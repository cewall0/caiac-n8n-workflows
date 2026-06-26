# Tally API Integration Plan

**Status: PENDING — blocked on API access**
**Integration style:** Tally webhook → n8n (inbound) + n8n → Tally API (outbound form creation)

---

## Context

CAIAC is gaining access to the Tally API (tally.so). The integration is bi-directional:
- **Inbound:** Tally POSTs form submissions to n8n webhooks in real time
- **Outbound:** n8n calls the Tally API to programmatically create and manage forms per client

The primary driver is **auto-creating client-specific forms during onboarding** — no manual form building per client. Full use case scope is in the section below.

This plan is a step-by-step framework to execute the moment API access is granted.

---

## Scope — Use Cases

### Tier 1: Build First
These are high-value, well-defined, and should be the first things built.

**1. Auto-Create Client Intake Form (Onboarding)**
During `[Onboarding] CAIAC Client Agent`, after a client is provisioned:
- n8n calls Tally API to create a branded intake form for that client
- Form is pre-configured with their service vertical's question set (trades vs. others)
- Form ID + URL stored in the DB against the client record
- URL delivered to the client via onboarding email
- When client submits → Tally webhook → n8n → normalizer → lead/intake processing

**2. Lead Capture Form (Website)**
Replace or supplement the current website lead form with a Tally-hosted form:
- One master "CAIAC Lead Capture" form on Tally
- Submission triggers existing `[Intake] CAIAC Lead Capture` workflow via webhook
- Hidden field carries the source/UTM data for scoring
- Tally handles spam filtering, file uploads, and mobile UX

**3. Service Request Form (Client Portal)**
Clients can submit new service/job requests from the dashboard via a Tally form:
- Each client has a pre-created service request form (auto-created at onboarding)
- Submission → n8n → creates job record in DB + notifies ops team
- Replaces any current ad-hoc request flow

### Tier 2: Build When Needed
These are valuable but depend on Tier 1 being stable first.

**4. Post-Job Satisfaction Survey**
After a job is marked complete in the system:
- n8n auto-generates a satisfaction survey via Tally API (or uses a template)
- Sends the form URL to the client via email/SMS
- Responses feed back into the client record in the DB + CRM

**5. Estimate / Quote Request Form**
For prospective clients who want pricing before committing:
- Tally form collects job scope, location, timeline
- Submission routes through `[CRM] Score Lead` and notifies the ops team
- Can be embedded on the website as a secondary CTA

**6. Recurring Client Check-In**
Monthly or quarterly automated check-in:
- n8n schedules a Tally form send per active client
- Collects satisfaction, upcoming needs, referral likelihood
- Responses stored in DB and surfaced in the ops dashboard

### Tier 3: Explore Later
- **Internal ops forms** — job intake, field tech reporting, equipment inspection checklists
- **Document collection** — file upload forms for certs, photos, permits (Tally handles upload hosting)
- **Form analytics pipeline** — pull completion rates + drop-off data from Tally API into the ops dashboard

---

## Phase 1 — Discovery (Do First, Same Session as Access)

Goal: understand the payload shape and what forms exist before touching any workflow.

- [ ] Add `Tally API` credential to staging (type: `httpHeaderAuth`, header: `Authorization`, value: `Bearer <token>`)
- [ ] Add matching `Tally API` credential to prod
- [ ] Read the Tally API docs — confirm which endpoints are available: create form, update form, delete form, list forms, get submissions, register webhook
- [ ] Fetch the list of existing forms from the Tally API — identify which map to CAIAC use cases
- [ ] Trigger a test Tally webhook (or use Tally's test mode) and capture the raw payload in n8n
- [ ] Document the payload schema: field IDs, field labels, types, and how multi-select / file upload fields serialize
- [ ] Identify the stable field identifiers (Tally uses UUIDs for field IDs — map them to human names)

**Output of Phase 1:** a payload reference doc saved to `docs/tally-payload-reference.md` with annotated field maps per form.

---

## Phase 2 — Workflow Impact Audit

Goal: identify every workflow that needs to change before writing a line of JSON.

Using the payload reference from Phase 1:

- [ ] Compare Tally field names/IDs against fields currently consumed by:
  - `[Intake] CAIAC Lead Capture` — does Tally replace the current webhook trigger? Or feed into it?
  - `[CRM] Score Lead` — does the scoring model rely on field names that differ in Tally?
  - `[Onboarding] CAIAC Client Agent` — does any onboarding step pull from intake data that will change shape?
  - Any other workflow that reads `name`, `email`, `phone`, `company`, or `message` from a webhook payload
- [ ] Decide integration pattern per use case:
  - **Option A — Tally as the trigger:** Replace existing webhook trigger with a Tally webhook node. Simplest but couples the workflow to Tally's payload shape.
  - **Option B — Tally → normalizer → existing workflows:** Build one `[Utility] Normalize Tally Payload` sub-workflow that maps Tally field IDs to our standard field names, then calls existing workflows unchanged. Recommended if multiple forms feed the same downstream workflows.
- [ ] List every affected workflow with the specific change needed

**Output of Phase 2:** annotated list of affected workflows + chosen integration pattern, appended to this plan.

---

## Phase 3 — Build (Staging First)

### 3a. Auto-Create Form Workflow (Outbound)

Build `[Tally] Create Client Form v1.0.0` — called by the onboarding agent after client provisioning:

- [ ] Accept `client_slug`, `client_name`, `service_vertical` as inputs
- [ ] Call Tally API to create a form from the appropriate template (trades vs. default)
- [ ] Store returned `form_id` and `form_url` in the DB against the client record
- [ ] Register the n8n staging/prod webhook URL on the new form via Tally API
- [ ] Return `form_url` to the caller (onboarding agent delivers it to the client)
- [ ] Add the call to `[Onboarding] CAIAC Client Agent` after the provisioning step

**DB change required:** add a `tally_forms` table (not just columns on `clients`) to support multiple forms per client:

```sql
CREATE TABLE caiac.tally_forms (
  id            SERIAL PRIMARY KEY,
  client_slug   TEXT NOT NULL REFERENCES caiac.clients(client_slug),
  form_id       TEXT NOT NULL UNIQUE,   -- Tally's form ID
  form_url      TEXT NOT NULL,
  form_type     TEXT NOT NULL,          -- 'lead', 'service_request', 'survey', 'internal'
  label         TEXT,                   -- human label, e.g. "Q2 Satisfaction Survey"
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

`form_type` is the routing key — the normalizer looks up the incoming `form_id` in this table to determine where to send the submission. Snapshot schema before migration.

### 3c. Build the Normalizer + Router

Build `[Tally] Normalize + Route Submission v1.0.0` — the single inbound webhook endpoint for ALL Tally forms:

- [ ] Single webhook path (e.g., `/tally/submission`) registered as the delivery URL for every Tally form
- [ ] Extract `form_id` from the Tally payload
- [ ] Query `caiac.tally_forms` to look up `client_slug` and `form_type` for that `form_id`
- [ ] Validate: reject with 400 if `form_id` is unknown (unregistered form)
- [ ] Validate leads: for `form_type = lead`, reject with 400 if **neither `email` nor `phone`** is present in the normalized payload — at least one contact field is required. Log the rejection so it's visible in executions.
- [ ] Route by `form_type` via Switch node:
  - `lead` → call `[Intake] CAIAC Lead Capture` (existing workflow)
  - `service_request` → call `[Jobs] Create Service Request` (new workflow, TBD)
  - `survey` → write response to DB, update client satisfaction score
  - `internal` → route to ops Slack/notification
- [ ] Normalize field IDs → standard field names before passing to downstream workflows (so downstream never sees raw Tally UUIDs)

**This is the only inbound Tally webhook.** All form types go through this one node. Do not build separate webhook endpoints per form type.

### 3d. Add Tally Webhook Trigger (Inbound)

For each affected workflow (or the normalizer if using Option B):

- [ ] In the n8n workflow, replace or add a `Webhook` trigger node configured for Tally's delivery format
- [ ] Add payload validation IF node after the trigger — verify expected Tally fields are present
- [ ] Map Tally field IDs → standard internal field names in a Set or Code node
- [ ] Test end-to-end on staging with a real Tally test submission

### 3d. Handle Tally-Specific Edge Cases

- [ ] File upload fields — Tally sends a URL, not the file. Decide: store URL as-is, or fetch and store the file?
- [ ] Multi-select fields — Tally serializes as an array. Confirm downstream nodes handle arrays correctly.
- [ ] Required field validation — Tally can submit partial forms if fields aren't marked required. Guard accordingly.
- [ ] Duplicate submissions — Tally doesn't deduplicate. Add a check (by email or submission ID) if needed.

### 3e. Credential + Security

- [ ] Enable Tally webhook signature verification if the API supports it (HMAC header check)
- [ ] Confirm the n8n webhook URL is registered in Tally's dashboard for each form

---

## Phase 4 — Test

- [ ] Submit a real test form through Tally → verify the full flow end-to-end in staging
- [ ] Check DB: confirm the correct rows were written with correct field values
- [ ] Check notifications: confirm any email/Slack alerts fired correctly
- [ ] Add test cases to the Vitest suite (`tests/workflows/tally-intake.test.ts`) — see `staging-credential-sync.md` Phase 4

---

## Phase 5 — Deploy to Prod

Standard deploy flow (see CLAUDE.md):

- [ ] Snapshot current prod workflow JSON before updating
- [ ] Deploy updated workflow(s) to prod via `n8n_update_full_workflow`
- [ ] Register the prod webhook URL in Tally's dashboard
- [ ] Activate workflows on prod
- [ ] Submit one real form → verify prod end-to-end
- [ ] Monitor first 24h of executions for errors

---

## Design Decisions (Locked)

| Decision | Choice | Reason |
|---|---|---|
| Inbound webhook endpoint | One unified `/tally/submission` endpoint | All form types route through a single normalizer; avoids per-form webhook management |
| Form type routing key | `form_type` column in `caiac.tally_forms` | Decouples routing logic from the workflow; adding a new form type = DB insert, not a workflow change |
| Form registry | `caiac.tally_forms` table (not columns on `clients`) | Clients will have multiple forms (intake, service request, survey); a table handles 1:many cleanly |
| Field ID handling | Normalizer maps Tally UUIDs → standard names | Downstream workflows never see raw Tally field IDs; field label changes in Tally don't break n8n |
| Lead contact requirement | Email OR phone required (not both) | A lead with no contact method is unworkable; reject at the normalizer before it reaches lead intake |

**Form type taxonomy:**

| `form_type` | Downstream target | Notes |
|---|---|---|
| `lead` | `[Intake] CAIAC Lead Capture` | Flows through lead scoring |
| `service_request` | `[Jobs] Create Service Request` | Existing client, no scoring |
| `survey` | DB write + ops notification | No downstream workflow |
| `internal` | Ops Slack/notification | Team-only forms |

---

## Open Questions (Resolve in Phase 1)

- Does the Tally API support programmatic form creation, or only webhook delivery? (Confirm before building Phase 3a)
- Can forms be created from a template/workspace form, or only from scratch?
- What fields does the form creation API accept — can we pass question structure, branding, conditional logic?

- Does Tally support webhook signature verification? (Preferred for security)
- Are field IDs stable across form edits, or do they change when a question is modified?
- Can one Tally form post to multiple webhook URLs (staging + prod simultaneously during transition)?
- What's the retry behavior if n8n returns a non-200? Does Tally retry?

---

## Notes

- Tally field IDs are UUIDs — never reference them by position or label, only by ID. Labels change; IDs don't (usually).
- Follow the parameterized template pattern (see `memory/feedback_workflow-templates.md`) — the Tally integration should work across multiple client slugs, not be bespoke per client.
- Credential names must match exactly between staging and prod for clean deploys.
