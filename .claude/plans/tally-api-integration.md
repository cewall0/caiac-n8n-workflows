# Tally API Integration Plan

**Status: PENDING — blocked on API access**
**Integration style:** Tally webhook → n8n (inbound) + n8n → Tally API (outbound form creation)

---

## Context

Kayak (built by CAIAC Digital) is gaining access to the Tally API (tally.so). The integration is bi-directional:
- **Inbound:** Tally POSTs form submissions to n8n webhooks in real time
- **Outbound:** n8n calls the Tally API to programmatically create and manage forms per Kayak client

The primary driver is **auto-creating client-specific forms during onboarding** — no manual form building per client. Forms are generated from niche-specific templates (e.g., college admissions consultant gets different intake fields than an event venue or HOA). Full use case scope is in the section below.

This plan is a step-by-step framework to execute the moment API access is granted.

**Kayak target niches this must support:** college admissions consultants, RE investing coaches, career coaches, HOA communities, small property managers, event venues, boutique hotels/B&Bs, trade school admissions, authors/publishers. Form templates must cover these — not a single "trades vs. others" split.

---

## Scope — Use Cases

### Tier 1: Build First
These are high-value, well-defined, and should be the first things built.

**1. Auto-Create Client Intake Form (Onboarding)**
During `[Onboarding] CAIAC Client Agent`, after a Kayak client is provisioned:
- n8n calls Tally API to create a branded intake form for that client
- Form is pre-configured from a **niche template** — the `niche` field on the client record determines which template to clone (e.g., `admissions_consultant`, `event_venue`, `hoa`, `property_manager`, `hospitality`, `coach`)
- Form ID + URL stored in the DB against the client record
- URL delivered to the Kayak client via onboarding email — they share it with their own prospects
- When a prospect submits → Tally webhook → n8n normalizer → lead/intake processing

**Niche template examples:**
| Niche | Key intake fields |
|---|---|
| College admissions consultant | Student name, parent name, email, phone, graduation year, target schools, GPA range |
| Event venue | Event type, date, guest count, name, email, phone, catering preference |
| HOA community | Resident name, unit/address, email, phone, request type, description |
| Property manager | Tenant name, unit, email, phone, issue type, urgency |
| B&B / boutique hotel | Guest name, email, phone, check-in date, check-out date, room preference, special requests |
| Coach / consultant | Name, email, phone, area of interest, current challenge |

**2. Lead Capture Form (Kayak Marketing)**
For Kayak's own marketing — capturing businesses that want to sign up for Kayak:
- One master "Kayak — Get Started" form on Tally
- Submission triggers `[Intake] CAIAC Lead Capture` workflow via webhook
- Hidden field carries source/UTM data for scoring
- Tally handles spam filtering and mobile UX

**3. Client Request Form (Client Portal)**
Existing Kayak clients can submit ongoing requests (essay drafts, maintenance requests, HOA approvals, etc.) from the portal:
- Each Kayak client gets a pre-created request form at onboarding, type-matched to their niche
- Submission → n8n → creates request record in DB + notifies the Kayak client (the business owner)
- Replaces ad-hoc email/text requests from their customers

### Tier 2: Build When Needed
These are valuable but depend on Tier 1 being stable first.

**4. Post-Service Survey**
After a service engagement ends (consult completed, event held, stay checked out, etc.):
- n8n auto-sends a satisfaction survey via Tally API
- Niche-specific questions (e.g., "How did your application season go?" vs. "How was your stay?")
- Responses stored in DB and surfaced in the ops dashboard

**5. Document / File Collection Form**
High priority for admissions consultants and property managers:
- Admissions: student uploads essay drafts, transcript, test scores
- Property manager: tenant uploads lease-required docs, maintenance photos
- Tally handles file hosting; n8n stores the URL reference in DB
- Submission → n8n → notifies the business owner + stores in client record

**6. Recurring Client Check-In**
Monthly or quarterly automated check-in for active Kayak clients (the businesses, not their customers):
- n8n schedules a Tally form send per active Kayak client
- Collects satisfaction, upcoming needs, referral likelihood
- Responses stored in DB and surfaced in the ops dashboard

### Tier 3: Explore Later
- **Form analytics pipeline** — pull completion rates + drop-off data from Tally API into the ops dashboard
- **Conditional logic forms** — niche-specific branching (e.g., HOA requests route differently by request type)

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

- [ ] Accept `client_id`, `client_slug`, `client_name`, `niche` as inputs
- [ ] Call Tally API to create a form from the niche-matched template (see niche template table in Use Cases)
- [ ] Store returned `form_id` and `form_url` in the DB against the client record
- [ ] Register the n8n staging/prod webhook URL on the new form via Tally API
- [ ] Return `form_url` to the caller (onboarding agent delivers it to the client)
- [ ] Add the call to `[Onboarding] CAIAC Client Agent` after the provisioning step

**DB change required:** add a `tally_forms` table (not just columns on `clients`) to support multiple forms per client:

```sql
CREATE TABLE caiac.tally_forms (
  id            SERIAL PRIMARY KEY,
  client_id     UUID NOT NULL REFERENCES caiac.clients(id),  -- never slug as FK
  form_id       TEXT NOT NULL UNIQUE,   -- Tally's form ID
  form_url      TEXT NOT NULL,
  form_type     TEXT NOT NULL,          -- 'lead', 'client_request', 'survey', 'document_collection'
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
| `lead` | `[Intake] CAIAC Lead Capture` | Prospect from outside; flows through lead scoring |
| `client_request` | DB write + notify business owner | Existing customer submitting a request (essay, maintenance, HOA approval, etc.) |
| `document_collection` | DB write + store file URL + notify owner | File uploads — essays, photos, lease docs; Tally hosts the file |
| `survey` | DB write + ops notification | Post-service satisfaction; no downstream workflow |

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
