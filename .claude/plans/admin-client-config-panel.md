# Admin Dashboard — Client Config Panel + Analytics

**Status: PLANNING**
**Repos touched:** `caiac-ops-dashboard`, `caiac-client-dashboard`, `caiac-n8n-workflows`

---

## What We're Building

A full client management layer added to the ops dashboard:

1. **Client Config Panel** — slide-over that covers all per-client settings in one place
2. **Analytics** — per-client funnel + platform-wide overview
3. **Tally Form Helper** — guided setup checklist generated from a client's field_map
4. **Client Dashboard AI Usage** — cap display on the client-facing portal

Also fixing two pre-existing bugs: Chat v2.6.0 has the Claude cap hardcoded as `100`; `[Admin] Get AI Usage v1.0.0` references a non-existent `metadata` column instead of `config`. Both read from `client_features.config->>'cap'` after the fix.

---

## Critical Fix (Do First)

### Chat v2.6.0 — `Get Claude Cap` node (staging ID: `kvu3hOiGTiuvbVlQ`)

Current SQL (broken — hardcoded):
```sql
SELECT
  100 AS cap,
  COALESCE(
    (SELECT request_count FROM caiac.ai_usage WHERE client_id = $1::uuid AND period = $2 LIMIT 1),
    0
  ) AS request_count
```

Fix — read cap from `client_features.config` (DB column is `config`, not `metadata`):
```sql
SELECT
  COALESCE((cf.config->>'cap')::int, 100) AS cap,
  COALESCE(au.request_count, 0) AS request_count
FROM caiac.client_features cf
LEFT JOIN caiac.ai_usage au
  ON au.client_id = cf.client_id AND au.period = $2
WHERE cf.client_id = $1::uuid
  AND cf.feature = 'advanced_ai'
LIMIT 1
```

This fix must go in before any cap editing in the dashboard has real effect.

**Cap enforcement status:**
- **Prod (v2.5.0):** No cap at all. Unlimited Claude usage.
- **Staging (v2.6.0):** Enforcement wired correctly but cap hardcoded to 100. Usage logs to `ai_usage` after each successful Claude call. Cap hits log to `audit_log` with action `'ai_cap_hit'`.

### `[Admin] Get AI Usage v1.0.0` — `Query AI Usage` node (staging ID: `STsGoDCDUJhjBgEE`)

Two bugs in the same workflow. Fix both in the same deploy:

**Bug 1 — `metadata` column doesn't exist (will SQL error):**
```sql
-- Current (broken):
COALESCE((cf.metadata->>'cap')::int, 100) AS cap

-- Fix:
COALESCE((cf.config->>'cap')::int, 100) AS cap
```

**Bug 2 — SQL injection via `slug` query param:**
```sql
-- Current (injectable — user-controlled string interpolated into SQL):
{{ $json.slug ? "AND c.slug = '" + $json.slug + "'" : '' }}

-- Fix — use parameterized query with conditional binding:
AND ($1::text IS NULL OR c.slug = $1)
-- Pass $1 = slug value or null
```

---

## DB Schema — Two Config Tables

Two tables hold client configuration. The split is intentional but had one duplication problem that needs cleaning up before we build the Reviews tab.

### What Lives Where

**`caiac.clients.config` JSONB** — flexible settings, written by `[Admin] Update Client Config v1.0.0`:
```
config.lead_capture.field_map          ← intake field mapping (source of truth)
config.lead_capture.notify_email       ← who gets lead notification emails (intake)
config.lead_capture.from_name          ← email sender name
config.lead_capture.from_email         ← email sender address
config.lead_capture.notify_phone       ← SMS notification number
config.lead_capture.lead_notify_method ← 'email' | 'sms'
config.lead_capture.sheet_id           ← ⚠️ DUPLICATE — remove after migration #3
config.quick_actions                   ← quick action buttons
config.ai.provider                     ← 'anthropic' | 'ollama'
config.ai.cloud_consent                ← boolean
```

**`caiac.client_platform_config`** — operational/platform config, written by `[Onboarding] Setup Client Sheet v1.0.0`:
```
client_slug          ← unique key (conflict target)
client_id            ← UUID FK
source_type          ← 'sheet' (future: 'db' for CRM clients)
lead_sheet_id        ← Google Sheet ID (single source of truth after migration)
lead_sheet_tab       ← 'Lead Information'
google_review_link   ← Google review redirect URL
facebook_review_link ← ⚠️ MISSING — add in migration #2
review_notify_email  ← who gets review admin emails (renamed in migration #1)
link_signing_secret  ← HMAC secret used to sign review links + Tally webhook URL
active               ← boolean
```

**Why keep both tables:** `client_platform_config` has `source_type` to support a future `'db'` row per client (CRM path, no sheet). A JSONB blob in `clients.config` can't cleanly handle multiple rows. Keep the split — fix the boundary.

### Which tab reads which table

| Panel tab | Source |
|---|---|
| Config (notify email, field_map, quick actions, branding, AI settings) | `clients.config` |
| Reviews (review links, review notify email, signing secret) | `client_platform_config` |
| Overview (sheet link) | `client_platform_config.lead_sheet_id` |
| Tally helper (webhook key) | `client_platform_config.link_signing_secret` |

### DB Migrations — Pre-flight Audit

Three workflows actively reference the fields being changed. Each migration has a required workflow update that must be deployed **before** the migration runs — otherwise live reviews break.

#### Field reference audit

| Field | Where referenced | How used | Risk if renamed/dropped without update |
|---|---|---|---|
| `client_platform_config.client_admin_email` | `[Reviews] Handle Rating Click` → `Prepare Followup Email` | `to: d.client_admin_email` — sends bad-rating followup email | Email silently drops (sends to `undefined`) |
| `client_platform_config.client_admin_email` | `[Onboarding] Setup Client Sheet` → upsert SQL | Column name in `INSERT` statement | INSERT fails for any new client onboarded after rename |
| `clients.config.lead_capture.sheet_id` | `[Admin] Update Client Config` → `Get Current Client Config` | `config->'lead_capture'->>'sheet_id' AS sheet_id` — used to decide whether to sync Sheet headers | Sheet header sync breaks (sheet_id returns NULL) |
| `facebook_review_link` | Nowhere — column doesn't exist yet | — | Safe to add anytime |
| `SELECT cpc.*` in `Get Client Review Config` | Returns all columns by wildcard | No hardcoded column name | Automatically picks up rename — no change needed |

#### Migration 1 — Add `facebook_review_link` (safe now, no workflow changes needed)

```sql
ALTER TABLE caiac.client_platform_config
  ADD COLUMN facebook_review_link TEXT;
```

#### Migration 2 — Rename `client_admin_email` → `review_notify_email`

**Must update these two workflows first, then deploy to prod, then run the SQL:**

Workflow update A — `[Reviews] Handle Rating Click v1.0.0` → `Prepare Followup Email` node:
```js
// Before
to: d.client_admin_email,
// After
to: d.review_notify_email,
```

Workflow update B — `[Onboarding] Setup Client Sheet v1.0.0` → `Upsert client_platform_config` node:
```sql
-- Before
INSERT INTO caiac.client_platform_config (..., client_admin_email, ...) VALUES (..., '{{ ... }}', ...)
ON CONFLICT (client_slug) DO UPDATE SET client_admin_email = EXCLUDED.client_admin_email, ...
-- After: replace both occurrences with review_notify_email
```

Then run migration:
```sql
ALTER TABLE caiac.client_platform_config
  RENAME COLUMN client_admin_email TO review_notify_email;
```

#### Migration 3 — Remove duplicate `sheet_id` from `clients.config`

**Must update `[Admin] Update Client Config v1.0.0` first, then deploy, then run the SQL:**

Workflow update — two nodes in `[Admin] Update Client Config v1.0.0`:

`Get Current Client Config` — change from reading sheet_id out of `clients.config` to joining `client_platform_config`:
```sql
-- Before
SELECT id, config, config->'lead_capture'->>'sheet_id' AS sheet_id
FROM caiac.clients WHERE slug=$1 AND active=true LIMIT 1

-- After
SELECT c.id, c.config, cpc.lead_sheet_id AS sheet_id
FROM caiac.clients c
JOIN caiac.client_platform_config cpc ON cpc.client_id = c.id
WHERE c.slug=$1 AND c.active=true LIMIT 1
```

`Build Config Patch` — remove `sheet_id` from the `fieldPaths` map:
```js
// Remove this line:
sheet_id: '{lead_capture,sheet_id}',
```

Then run migration:
```sql
UPDATE caiac.clients
  SET config = config #- '{lead_capture,sheet_id}';
```

---

## Feature Registry (Corrected)

| Key | Type | Notes |
|---|---|---|
| `chat` | core — no toggle | Disabling would brick the product |
| `reviews` | add-on | ✅ corrected from earlier |
| `intake` | add-on | ✅ corrected from earlier |
| `crm_sync` | add-on | |
| `lead_scoring` | add-on | Depends on `intake` |
| `advanced_ai` | add-on | Claude cloud AI; triggers AI tab controls |
| `sms` | add-on | Workflow not built — show "Coming soon" chip |

### Feature Dependencies (frontend only — no backend needed)

```ts
const FEATURE_DEPS: Partial<Record<FeatureKey, FeatureKey[]>> = {
  lead_scoring: ['intake'],
  crm_sync: ['intake'],
  // extend here as new features are added
};
```

When a user tries to disable `intake` while `lead_scoring` is on: block the toggle and show
"Lead Scoring requires Intake. Disable Lead Scoring first."

---

## AI Cap System

**Storage:** `client_features WHERE feature = 'advanced_ai' → config->>'cap'` (integer, defaults to 100)
  - DB column is `config JSONB` (confirmed from live schema). References to `metadata` anywhere in this codebase are wrong — use `config`.
**Usage tracking:** `caiac.ai_usage (client_id UUID, period TEXT, request_count INT, last_used_at TIMESTAMPTZ)`
**Enforcement:** Chat v2.6.0 `Cap Exceeded?` node → falls back to Ollama silently, logs `ai_cap_hit` to `audit_log`
**Provider routing:** `clients.config.ai.provider` — `"anthropic"` or `"ollama"`
**Cloud consent:** `clients.config.ai.cloud_consent` — boolean, must be `true` before routing to Anthropic

Three controls that belong together in the AI tab:
1. Provider selector (Ollama / Claude)
2. Cloud consent toggle (with compliance note)
3. Monthly cap (number input with preset steps: 100, 250, 500, 1000, or custom — only visible when provider = Claude)

Write path: provider + cloud_consent → `[Admin] Update Client Config v1.0.0` with `field: "ai"` and value `{ provider, cloud_consent }`. Cap → `[Admin] Update Feature Config v1.0.0` (new workflow) writing to `client_features.config`.

**Client dashboard:** Show AI usage bar only when `advanced_ai` feature is enabled. Needs new `[Client] Get AI Usage v1.0.0` endpoint (client-auth'd, returns own slug's usage only).

**Footer copy fix:** Client dashboard `AIAssistant.tsx` footer says "Powered by private model · zero retention" — inaccurate when `cloud_consent = true`. Change to "Powered by Claude · data processed per Anthropic's privacy policy" conditionally, or just remove the zero retention claim from the base copy.

---

## UX / Save Model

### Save tiers

| Control | Behavior |
|---|---|
| Feature toggles, provider selector, cloud consent | Instant-save. Optimistic flip → revert + toast on error. Spinner in toggle track during save. |
| Cap (number), text fields (email, branding, review links) | Section-level Save button appears on first change. Cancel reverts. Tab label shows unsaved-changes dot. |
| Quick actions (checkboxes) | Section-level Save button. |
| User add/edit | Modal with its own Save / Cancel. |

### Feedback
- Toast notifications: bottom-right, auto-dismiss 3s, green/red
- Inline error text under failing fields (not modal alerts)
- Save button shows spinner while in-flight, then "Saved ✓" for 2s
- Toggles disabled until their section finishes loading

### Loading
- Panel opens immediately with skeleton screens per section
- Tabs load content on first access (lazy — not all upfront)
- No full-overlay spinners — skeletons or section-level loading states only

### Empty states (always actionable)
- No users → inline "Add first user" button
- No errors in 7 days → green checkmark
- No intake config → "Configure intake to generate Tally setup"
- No leads this month → "No leads yet" (not a broken chart)
- No quick actions → "None configured — add one below"

---

## Panel Structure

Slide-over from the right edge, full viewport height.
Triggered by a gear icon button next to the client name in the ops dashboard header.
Tabs across the top; active tab has an underline indicator.

### Tab: Overview
- Client status badge (Active / Inactive)
- Churn risk signal (Green / Yellow / Red based on last activity)
- RAG collection health pill (from existing CollectionHealth data)
- CRM type + connection status (read-only: "Pipedrive — Connected" or "Not configured")
- Last lead received (e.g. "3 days ago")
- Last AI request (e.g. "Today")
- Error count badge last 24h (clicking scrolls to error log below)
- Open Sheet button → `https://docs.google.com/spreadsheets/d/{sheet_id}`
- Recent Errors list (last 5 entries: workflow name, node, message, time)
- Danger Zone (bottom, visually separated): "Deactivate Client" button — disabled with tooltip "Offboard workflow not yet built" until `[Admin] Offboard Client v1.0.0` ships

### Tab: Features
- Toggle list, one row per feature
- Row structure: `[toggle] Feature Name [add-on badge or coming-soon chip]`
- Subtitle under each: `Enabled Jun 10, 2026 by lukesgray` (from `enabled_at` + `enabled_by`)
- `sms` row has "Coming soon" chip, toggle disabled
- `chat` row has "Core — always on" chip, no toggle
- Dependency guard: when disabling blocks dependent features, show inline warning inline

### Tab: AI
- **Provider** — segmented control: `Ollama (on-device)` | `Claude (cloud)`
- **Cloud Consent** — toggle, always visible in the AI tab
  - Label: "Client has consented to data being processed by Anthropic"
  - Small note: "Required before routing to Claude. Must be documented in client agreement."
  - When provider = Claude AND cloud_consent = false: show yellow banner above the provider control — "Cloud consent is off. Requests will fall back to Ollama until consent is enabled."
  - This means you CAN select Claude without consent enabled — the banner makes the state clear without blocking. Routing fallback is enforced in the Chat workflow.
- **Monthly Cap** — number input with preset buttons (100 / 250 / 500 / 1000) + custom entry
  - Only visible when provider = Claude
  - Shows current month's usage below: "42 / 100 requests used"
  - Progress bar (green <70%, yellow 70–90%, red >90%)
- **Usage Trend** — bar chart, one bar per month, cap as a horizontal line, respects the Analytics tab timeframe selector default (3 months)

### Tab: Config
- **Notify Email** — text input
- **Branding** — three fields: AI persona name, tagline, primary color (color picker)
- **Quick Actions** — checkbox grid of the 5 known actions
  - Checked = included; order set by check order
  - Save button per section
- **Intake Configs** — list of form configs (one today, multiple in the future)
  - Each row: config name / label + field count + "Tally Setup" button
  - "Add Form Config" button (grayed out with tooltip "Multiple configs coming soon")

### Tab: Reviews
All fields read/write `client_platform_config` via `[Admin] Get/Update Client Platform Config v1.0.0`.
- Google review link (text input → `google_review_link`)
- Facebook review link (text input → `facebook_review_link`, added in migration #2)
- Review notify email (text input → `review_notify_email`, renamed in migration #1)
- Signing secret (masked display + copy button → `link_signing_secret`, read-only)
- Save button for the section

### Tab: Users
- User list: name, email, role badge, status (Active/Inactive), must-change-password indicator
- Per-user actions: Reset Password, Force Change, Enable/Disable
- "Add User" button → inline form: name, email, role selector, temp password field

### Tab: Analytics

All trend charts default to **3 months**. Timeframe selector (1 / 3 / 6 / 12 months) in the tab header applies to all charts at once.

- **Lead Funnel** (selected period, this client):
  `Leads → Qualified (score ≥ 7) → CRM Synced → Review Sent → Responded → Positive`
  Show count + conversion % at each step.
  Data sources (all confirmed in live schema):
  - Total: `COUNT(*) FROM caiac.leads WHERE client_id = $1 AND created_at >= period_start`
  - Qualified: `WHERE qualification_score >= 7` (`leads.qualification_score smallint`)
  - CRM Synced: `WHERE crm_synced_at IS NOT NULL` (`leads.crm_synced_at`)
  - Review Sent / Responded / Positive: `caiac.automation_runs` joined to leads — `WHERE automation_type = 'review_request'`; sent = `sent_at IS NOT NULL`; responded = `responded_at IS NOT NULL`; positive = `outcome = 'positive'`
  - ⚠️ **Pre-build check:** Run `SELECT DISTINCT automation_type FROM caiac.automation_runs LIMIT 20` before writing this query — the exact string written by `[Reviews] Process Completed Lead v1.0.0` must match. Update the filter if it's not `'review_request'`.

- **Review Funnel** (monthly grouped bar, selected period):
  Sent / responded / positive per month. Source: `automation_runs` joined to `leads` for `client_id` scoping.

- **AI Usage Trend** (monthly bar, selected period):
  Bar chart of `ai_usage.request_count` per month, cap as horizontal line. Source: `caiac.ai_usage WHERE client_id = $1`.

- **Quick Action Usage**:
  Table — `caiac.quick_action_usage (client_id, action_key, period, use_count, last_used_at)`. Existing ClientInsights table, moved here.

- **Document Staleness**:
  Table of all client documents with last-ingested date (`documents.uploaded_at`) and chunk count (`documents.chunks_indexed`). Flag any doc not re-ingested in 30+ days with a yellow warning. Clicking "Re-ingest" in this view opens the document upload flow pre-filled with that document's filename (user must re-upload the file — source files are not stored). Source: `caiac.documents WHERE client_id = $1 AND deleted_at IS NULL`.

- **Client ROI Score** (single metric card):
  Composite score 0–100 computed from:
  - Lead conversion rate (qualified / total) — 30 pts
  - Review response rate (responded / sent) — 30 pts
  - Review positive rate (positive / responded) — 20 pts
  - AI engagement (has any AI usage this month) — 10 pts
  - Feature adoption (features enabled / total available) — 10 pts
  Displayed as a gauge or score card with a trend arrow vs last period. Computed in the `[Admin] Get Client Analytics v1.0.0` workflow — no new table needed.

### Tab: Onboarding
- Provisioning state: step-by-step list with ✓ / ✗ per step
  Steps: Create Client Record, Setup Sheet, Create User, Stub CRM Config, Seed Features, Send Welcome Email, Smoke Test
- "Re-run" button next to any failed step
- "Onboard New Client" section (only show when no client is loaded, or as a separate button in the header)

---

## Tally Form Helper

Triggered by "Tally Setup" button on an intake config row in the Config tab.
Opens a focused modal (not a full page).

### Step 1 — Create these questions in Tally

Table showing every field in the client's `field_map`, in intake order:

| # | Question Label (paste exactly) | Tally type | Required | Copy |
|---|---|---|---|---|
| 1 | Full Name | Short text | ✓ | [Copy] |
| 2 | Email Address | Email | ✓ | [Copy] |
| ... | ... | ... | ... | ... |

Label text is bolded and copy button puts it on clipboard exactly.
A note at the top: "These labels must match exactly — they're how we map Tally's response to our fields."

For fields with dropdown options (e.g. service type), show the options list inline.

### Step 2 — Add webhook in Tally

```
Tally → Integrations → Webhooks → New Webhook

URL:  https://flows.caiacdigital.com/webhook/intake/lead?slug=henderson&key=••••••  [Show] [Copy Full URL]
```

Key comes from `client_platform_config.link_signing_secret`. Masked by default, reveal on click. **Security note:** this secret is served in the API response and is visible in browser devtools to any authenticated staff user — this is an accepted risk for an internal ops tool. "Copy Full URL" copies the complete pre-built URL so the raw secret doesn't need to be manually handled.

### Step 3 — Send a test

"Send Test Lead" button → calls a CF Function (`/api/admin-tally-test-lead`) with `{ slug }` — **the browser never touches the signing secret directly**. The CF Function fetches `link_signing_secret` server-side, constructs the signed intake URL, fires the POST, and returns the field-matching result. This keeps the secret out of browser-initiated request URLs. Assumes `[Intake] CAIAC Lead Capture v2.1.0` is live and healthy. Shows per-field result:

```
✓  name         → Luke Gray
✓  email        → test@caiacdigital.com
✓  phone        → 555-0100
✗  service      → MISSING (check field label in Tally matches exactly)
```

A field shows ✗ if it's present in the field_map but absent in the intake response's parsed `intake_data`. Failures tell you which label to fix in Tally before closing the modal. The test lead is written to the DB with `source = 'tally-helper-test'` so it can be identified and excluded from real reporting.

---

## Platform-Level Analytics (Main Dashboard)

New top section added above the existing cards — always visible, not per-client.

### Platform Overview Bar

One row of stat chips, single query in `[Admin] Platform Overview v1.0.0`:
- Total active clients — `SELECT COUNT(*) FROM caiac.clients WHERE active = true`
- Total leads this month (all clients) — `SELECT COUNT(*) FROM caiac.leads WHERE created_at >= date_trunc('month', now())`
- Review requests sent this month — `SELECT COUNT(*) FROM caiac.automation_runs WHERE sent_at >= date_trunc('month', now())` *(use verified `automation_type` value from pre-build check)*
- Review response rate — `responded_count / sent_count` as %
- Clients at >80% AI cap — `SELECT COUNT(DISTINCT cf.client_id) FROM caiac.client_features cf JOIN caiac.ai_usage au ON au.client_id = cf.client_id AND au.period = to_char(now(), 'YYYY-MM') WHERE cf.feature = 'advanced_ai' AND cf.enabled = true AND (cf.config->>'cap')::int > 0 AND au.request_count::float / (cf.config->>'cap')::int > 0.8`
- Errors in last 24h — `SELECT COUNT(*) FROM caiac.error_log WHERE created_at >= now() - interval '24 hours'`

### Feature Adoption Heatmap

Grid: clients as rows, features as columns. Colored cell = enabled.
Shows which clients are on which features at a glance.
Useful for identifying upsell opportunities (clients eligible for a feature but not using it).

---

## Build List

### n8n Workflows (staging first, then deploy to prod)

> **Tagging:** apply tags on every workflow created or updated. Use the platform scheme: `admin`, `auth`, `chat`, `client`, `deprecated`, `intake`, `maintenance`, `onboarding`, `rag`, `reviews`, `utility`. Match the `[Category]` bracket where applicable; add `deprecated` for any superseded version kept for reference.

All new admin workflows must follow this auth pattern: call `[Utility] Full Auth v2.0.0` → assert `role IN ('staff', 'admin')` → proceed. Client-facing workflows assert a valid client JWT and scope all queries to the JWT's `client_id`. Use parameterized queries (no string interpolation of user input into SQL). Set `saveDataSuccessExecution: "none"` on any workflow that handles passwords or PII in its response.

| Workflow | Endpoint | Auth | Security notes |
|---|---|---|---|
| `[Admin] Get Client Config v1.0.0` | `GET /admin/client-config?slug=X` | Staff JWT | — |
| `[Admin] Update Feature Config v1.0.0` | `POST /admin/update-feature-config` | Staff JWT | Validate feature key against allowlist before writing |
| `[Admin] Manage Client User v1.0.0` | `POST /admin/manage-client-user` | Staff JWT | `saveDataSuccessExecution: "none"` — temp passwords in response. Scope user queries to requested client_id only (cross-client isolation). |
| `[Admin] Get Client Errors v1.0.0` | `GET /admin/client-errors?slug=X&limit=10` | Staff JWT | — |
| `[Admin] Get Client Analytics v1.0.0` | `GET /admin/client-analytics?slug=X&months=3` | Staff JWT | Parameterize slug — no string interpolation. `months` defaults to 3; UI passes 1/3/6/12. |
| `[Admin] Platform Overview v1.0.0` | `GET /admin/platform-overview` | Staff JWT only | Cross-client data — must reject client-level JWTs even if otherwise valid |
| `[Admin] Get/Update Client Platform Config v1.0.0` | `GET/POST /admin/client-platform-config` | Staff JWT | `link_signing_secret` returned read-only on GET; never writable via POST (must be regenerated via separate action) |
| `[Admin] Trigger Onboarding v1.0.0` | `POST /admin/trigger-onboarding` | Staff JWT | Idempotent — check client doesn't already exist before creating |
| `[Admin] Rerun Onboarding Step v1.0.0` | `POST /admin/rerun-onboarding-step` | Staff JWT | — |
| `[Client] Get AI Usage v1.0.0` | `GET /client/ai-usage` | Client JWT | `client_id` from JWT only — never from query params or body. No `?slug=X` override. |

### Cloudflare Functions — Ops Dashboard (`functions/api/`)

| File | Method | Proxies to |
|---|---|---|
| `admin-client-config.ts` | GET | `/admin/client-config` |
| `admin-toggle-feature.ts` | POST | `/admin/client-feature` (existing Toggle workflow) |
| `admin-update-feature-config.ts` | POST | `/admin/update-feature-metadata` |
| `admin-manage-client-user.ts` | POST | `/admin/manage-client-user` |
| `admin-client-errors.ts` | GET | `/admin/client-errors` |
| `admin-client-analytics.ts` | GET | `/admin/client-analytics` |
| `admin-platform-overview.ts` | GET | `/admin/platform-overview` |
| `admin-client-platform-config.ts` | GET + POST | `/admin/client-platform-config` |
| `admin-trigger-onboarding.ts` | POST | `/admin/trigger-onboarding` |
| `admin-rerun-onboarding-step.ts` | POST | `/admin/rerun-onboarding-step` |
| `admin-tally-test-lead.ts` | POST | Fetches `link_signing_secret` server-side → constructs signed intake URL → fires test lead → returns field match results. Secret never sent to browser. |

### Cloudflare Functions — Client Dashboard (`functions/api/`)

| File | Method | Proxies to |
|---|---|---|
| `client-ai-usage.ts` | GET | `/client/ai-usage` |

### Ops Dashboard Components (`src/components/`)

| Component | Tab / Location | Description |
|---|---|---|
| `ClientConfigPanel.tsx` | Shell | Slide-over, tab navigation, open/close state, unsaved-changes tracking |
| `PanelOverview.tsx` | Overview tab | Status, churn signal, health, CRM, timestamps, error log, danger zone |
| `FeatureToggles.tsx` | Features tab | Toggles with audit trail, dependency guard, coming-soon chips |
| `AIProviderConfig.tsx` | AI tab | Provider selector, cloud consent (with fallback banner), cap input, usage bar, usage trend chart |
| `IntakeConfigList.tsx` | Config tab | Intake config list with Tally Setup button per row |
| `TallySetupModal.tsx` | Config tab | Guided 3-step Tally form setup modal |
| `QuickActionsEditor.tsx` | Config tab | Checkbox grid replacing current JSON textarea |
| `BrandingConfig.tsx` | Config tab | ai_persona_name, tagline, primary_color |
| `ReviewsConfig.tsx` | Reviews tab | Review links, notify email, signing secret display. Threshold field deferred — see Open Items (`review_min_rating` column decision). |
| `UserManager.tsx` | Users tab | User list, add/edit/reset |
| `ClientAnalytics.tsx` | Analytics tab | Lead funnel, review funnel, AI trend, QA usage table |
| `OnboardingLauncher.tsx` | Onboarding tab | Provisioning state, re-run steps, new client form |
| `PlatformOverviewBar.tsx` | Main dashboard (top) | Platform-level stat chips |
| `FeatureAdoptionHeatmap.tsx` | Main dashboard | Cross-client feature grid |

### Client Dashboard Components (`src/components/`)

| Component | Location | Description |
|---|---|---|
| `AIUsageBar.tsx` | Dashboard or Topbar | Cap usage bar — only renders when `advanced_ai` feature on |

### Document Management Additions (ops dashboard)

The `documents` table already has `chunks_indexed`, `uploaded_at`, `deleted_at`, and `role` — no migrations needed for any of these.

| Addition | Where | What it does | Backend needed |
|---|---|---|---|
| Chunk count column | Existing document list | Show `chunks_indexed` per doc (e.g. "47 chunks") | **Verify first** — check that `[Admin] List Client Documents v1.0.0` already returns `chunks_indexed`; add to query if missing |
| Last ingested date | Existing document list | Show `uploaded_at` formatted as relative time | **Verify first** — check that `uploaded_at` is already returned; add if missing |
| Staleness flag | Existing document list | `is_stale: true` when `uploaded_at < now() - 30 days` | Yes — compute in `[Admin] List Client Documents` response and return `is_stale` boolean; do not compute client-side (stale state won't update mid-session) |
| Role badge | Existing document list | Show doc's `role` value (staff / admin / etc.) | **Verify first** — check that `role` is already returned; add if missing |
| **RAG search tester** | New panel in document library | Type a question → see which chunks surface → debug why AI said X | Yes — new `[Admin] Test RAG Query v1.0.0` workflow that runs a similarity search against Qdrant for a given client + query |

The RAG search tester is the highest-value addition: it lets you debug AI responses ("why did it say that?") by seeing the exact chunks that would be retrieved. Add to Phase 2 build list if desired — it's a one-node Qdrant query workflow + a small UI panel.

---

## Build Order

### Phase 0 — DB Cleanup (before any dashboard work)

These must run in this exact order. Snapshot schema before each migration per CLAUDE.md policy.

1. **Run migration 1** — `ADD COLUMN facebook_review_link`. No workflow dependencies. Safe now.
2. **Update `Handle Rating Click` → `Prepare Followup Email`** — `client_admin_email` → `review_notify_email`. Deploy to prod.
3. **Update `Setup Client Sheet` → upsert SQL** — column name `client_admin_email` → `review_notify_email` in both INSERT and ON CONFLICT SET. Deploy to prod.
4. **Run migration 2** — `RENAME COLUMN client_admin_email TO review_notify_email`. Only after steps 2 + 3 are live.
5. **Update `[Admin] Update Client Config v1.0.0`** (prod: `b8StToReJzg1bzKp`) — `Get Current Client Config` node: SQL now joins `client_platform_config` for sheet_id instead of reading from `clients.config`. `Build Config Patch` node: remove `sheet_id` from `fieldPaths`. Deploy to prod. *(This is the config-update workflow, distinct from `[Admin] Get/Update Client Platform Config v1.0.0` which is a new workflow built in Phase 2.)*
6. **Run migration 3** — drop `config.lead_capture.sheet_id` JSONB path. Only after step 5 is live.

### Phase 1 — Critical Fix

7. **Fix Chat v2.6.0 `Get Claude Cap` node** — replace hardcoded `100` with live DB read from `client_features.config->>'cap'`. Staging only, deploy to prod after smoke test.
7a. **Fix `[Admin] Get AI Usage v1.0.0` `Query AI Usage` node** — same deploy: `metadata` → `config`, parameterize `slug` to remove SQL injection. Activate in staging, add to registry.
7b. **Update `tests/workflows/chat-v26.test.ts`** — add cap enforcement test case (set `config->>'cap' = 1`, send 2 messages, assert Ollama fallback, verify `ai_usage` DB row, restore).

### Phase T — Autonomous Test Infrastructure *(run alongside Phase 1 or early Phase 2 — fully independent)*

T1. **Install Playwright in ops dashboard**
```bash
cd caiac-ops-dashboard && npm install -D @playwright/test && npx playwright install chromium
```

T2. **Install Playwright in client dashboard**
```bash
cd caiac-client-dashboard && npm install -D @playwright/test && npx playwright install chromium
```

T3. **Add to `.gitignore` in both dashboard repos:**
```
playwright/.auth/
test-results/
playwright-report/
```

T4. **Create `caiac-ops-dashboard/playwright.config.ts`** — `baseURL` from `OPS_DASHBOARD_URL` env var, auth setup project that signs in once and saves state to `playwright/.auth/ops-staff.json`, reused by all tests.

T5. **Create `caiac-client-dashboard/playwright.config.ts`** — same pattern, `CLIENT_DASHBOARD_URL`, state to `playwright/.auth/client-user.json`.

T6. **Add to `caiac-n8n-workflows/.env.test.example`:**
```
OPS_DASHBOARD_URL=https://ops-staging.caiacdigital.com
CLIENT_DASHBOARD_URL=https://app-staging.caiacdigital.com
TEST_REVIEW_CLIENT_SLUG=test-review-client
# ⚠️ N8N_WEBHOOK_BASE must be staging — tests write to the shared DB
```

T7. **Create `caiac-n8n-workflows/tests/helpers/sign.ts`** — HMAC sign helper using Node `crypto`. Signs review webhook payloads for Handle Rating Click tests without needing a real email click.

T8. **Create `caiac-n8n-workflows/tests/fixtures/analytics.ts`** — `seedAnalyticsData(clientId)` / `cleanAnalyticsData(clientId)`. Inserts deterministic leads, automation_runs, ai_usage rows tagged `_source: 'test-analytics'`. Required by `admin-client-analytics.test.ts` to assert exact funnel values.

T9. **Add `globalTeardown` export to `caiac-n8n-workflows/tests/setup.ts`** — deletes all `_source = 'test-*'` rows across all test-tagged tables on process exit, even if individual `afterAll` blocks crash.

T10. **Add nightly cleanup node to `CAIAC Maintenance - Nightly Cleanup v1.0.0`** — deletes orphan test rows older than 1 hour: `DELETE FROM caiac.leads WHERE intake_data->>'_source' LIKE 'test-%' AND created_at < now() - interval '1 hour'`. Same for `automation_runs`, `ai_usage`.

T11. **Seed dedicated test-only client in staging DB** — a client row used only by HMAC sign helper tests (not henderson). Needs its own `client_platform_config` row with a `link_signing_secret`. Add `TEST_REVIEW_CLIENT_SLUG` to `.env.test.example`.

### Phase 2 — New n8n Workflows (staging → prod)

Pattern for each step: build in staging → write test → `npm test` passes → deploy to prod → add smoke test in `tests/smoke/`.

8. **`[Admin] Get Client Config v1.0.0`** *(needs Phase 0 migration 2 live)* → `tests/workflows/admin-client-config.test.ts`
9. **`[Admin] Update Feature Config v1.0.0`** → `tests/workflows/admin-update-feature-config.test.ts`
10. **`[Admin] Get Client Errors v1.0.0`** → `tests/workflows/admin-client-errors.test.ts`
11. **`[Admin] Get/Update Client Platform Config v1.0.0`** *(needs Phase 0 migration 2 live)* → `tests/workflows/admin-client-platform-config.test.ts`
12. **`[Admin] Manage Client User v1.0.0`** → `tests/workflows/admin-manage-client-user.test.ts` *(security-critical — cross-client isolation test required)*
13. **`[Admin] Get Client Analytics v1.0.0`** → `tests/workflows/admin-client-analytics.test.ts` *(uses analytics seed fixture from T8)*
14. **`[Admin] Platform Overview v1.0.0`** → `tests/workflows/admin-platform-overview.test.ts`
15. **`[Client] Get AI Usage v1.0.0`** → `tests/workflows/client-ai-usage.test.ts` *(security-critical — verify no slug override possible)*
16. **`[Admin] Trigger Onboarding v1.0.0`** + **`[Admin] Rerun Onboarding Step v1.0.0`** → smoke test only (creates real records; full integration test deferred per existing onboarding deferral)

### Phase 3 — Ops Dashboard

Pattern for each step: build component → write Playwright test → `npx playwright test` passes → ship.

17. **Panel shell + Features tab** — `ClientConfigPanel`, `FeatureToggles` → `tests/e2e/panel-features.spec.ts` (panel opens, tabs navigate, toggle fires + optimistic flip, dependency guard shows, coming-soon disabled)
18. **AI tab** — `AIProviderConfig` → `tests/e2e/panel-ai.spec.ts` (provider switch, consent banner when off, cap save persists on reload)
19. **Config tab** — `IntakeConfigList`, `TallySetupModal`, `QuickActionsEditor`, `BrandingConfig` → `tests/e2e/panel-config.spec.ts` (email saves, quick actions persist, Tally modal opens to Step 1)
20. **Reviews tab** — `ReviewsConfig` *(needs #11 + migration 2)* → `tests/e2e/panel-reviews.spec.ts` (link saves, secret masked/reveals)
21. **Users tab** — `UserManager` → `tests/e2e/panel-users.spec.ts` (list loads, add-user form, reset sets indicator)
22. **Overview tab** — `PanelOverview` → `tests/e2e/panel-overview.spec.ts` (status badge, error log, sheet link)
23. **Analytics tab** — `ClientAnalytics` → `tests/e2e/panel-analytics.spec.ts` (all sections mount, timeframe selector fires new request, no empty-state errors)
24. **Platform overview + heatmap** — `PlatformOverviewBar`, `FeatureAdoptionHeatmap` → `tests/e2e/platform-overview.spec.ts` (stat chips render, grid present)

### Phase 4 — Client Dashboard

25. **`AIUsageBar`** → `caiac-client-dashboard/tests/e2e/ai-usage-bar.spec.ts` (renders when `advanced_ai` on, absent when off, shows correct cap + usage)
26. **Footer copy fix** → extend `ai-usage-bar.spec.ts` (footer text changes with `cloud_consent` state)

---

## Resolved Questions

- [x] **Review links storage** — `google_review_link` is in `client_platform_config`. Facebook link doesn't exist yet — added via migration #2. Reviews tab reads/writes `client_platform_config`.
- [x] **Intake config multi-form** — field_map lives in `clients.config.lead_capture.field_map` as a flat object. No `intake_config` column exists separately. Future multi-form shape: `clients.config.intake_configs: [{ id, name, field_map, tally_form_id }]` — data migration when second form is added for any client.
- [x] **Tally webhook key** — comes from `client_platform_config.link_signing_secret`. Already confirmed in live workflow SQL.
- [x] **Churn risk thresholds** — Yellow = no activity 8–30 days, Red = 30+ days. Tune after seeing real data.

## Phase Independence & Breaking Change Notes

### What can run in parallel

- **Phase 1** (cap fix) is fully independent — can run any time
- **Phase 4** (client dashboard) is fully independent of Phase 0 — just needs Phase 2 step 15
- **Phase 3** panel shell, Features, AI, Config, Users, Analytics tabs can all build while Phase 0 is in progress
- **Phase 3 Reviews tab** must wait for Phase 0 migration 2 to be live
- **Phase 2** `[Admin] Get Client Config` and `[Admin] Get/Update Client Platform Config` should be built after migration 2 — they read `client_platform_config` and must use the renamed column

### Breaking change: Migration 2 window

There is no zero-downtime way to rename `client_admin_email`. Either order creates a brief break:
- Rename first → `Handle Rating Click` + `Setup Client Sheet` break immediately
- Deploy workflows first → followup emails silently drop until rename runs

**Mitigation:** Do off-hours. Run the SQL rename, then deploy both workflow updates within the same minute. Consequence of the gap (a missed followup email) is recoverable.

### Breaking change: Phase 1 cap fix

If any client already has `client_features.config->>'cap'` set to a non-null value, their effective cap changes the moment this deploys. Verify before deploying:

```sql
SELECT c.slug, cf.config
FROM caiac.client_features cf
JOIN caiac.clients c ON c.id = cf.client_id
WHERE cf.feature = 'advanced_ai'
  AND cf.config IS NOT NULL
  AND cf.config != '{}';
```

If empty — safe. If any rows — coordinate cap changes with those clients first.

---

## Tests

Tests live in `tests/workflows/` and run against staging. Rule: every workflow with `active` or `staging` status needs a test file before prod deploy.

### Existing test to update

| File | What to add |
|---|---|
| `tests/workflows/chat-v26.test.ts` | Cap enforcement: set `config->>'cap' = 1` in `client_features WHERE feature='advanced_ai'` for test client, send 2 messages, assert second response still returns 200 (Ollama fallback). Verify `ai_usage.request_count` in DB. Restore cap after test. |

### New test files (one per Phase 2 workflow)

| File | Key cases |
|---|---|
| `tests/workflows/admin-client-config.test.ts` | Valid slug returns features + config shape; 401 without token; 404 for unknown slug |
| `tests/workflows/admin-update-feature-config.test.ts` | Staff can set cap; non-staff gets 403; unknown feature gets 400; DB assertion that `client_features.config->>'cap'` was written; cleanup restores original |
| `tests/workflows/admin-client-errors.test.ts` | Returns array (empty ok); auth guard |
| `tests/workflows/admin-client-platform-config.test.ts` | GET returns expected fields including `review_notify_email`; POST updates `google_review_link`; auth guard; DB assertion |
| `tests/workflows/admin-client-analytics.test.ts` | Returns `lead_funnel`, `review_funnel`, `ai_trend` shape; auth guard |
| `tests/workflows/admin-platform-overview.test.ts` | Returns all stat chip fields; auth guard |
| `tests/workflows/admin-manage-client-user.test.ts` | **Security-critical** — list returns only users for requested client; cross-client isolation (staff for client A cannot retrieve client B users); reset password sets `must_change_password = true` in DB |
| `tests/workflows/client-ai-usage.test.ts` | **Security-critical** — client JWT only returns own slug's data; auth guard; response contains `cap`, `request_count`, `pct_used`, `resets_at` |

`admin-manage-client-user` and `client-ai-usage` are highest priority — both touch multi-tenancy. A bug in either leaks data across clients.

### Handle Rating Click (Phase 0 change — no existing test)

`[Reviews] Handle Rating Click v1.0.0` has no staging version and no test. Deploy a staging version, then add `tests/workflows/reviews-rating-click.test.ts`. The HMAC sign helper (see below) makes this fully automatable — no human click needed.

---

## Autonomous Testing Infrastructure

Goal: I can run a full test pass without the user manually clicking anything in a browser.

### 1 — Playwright E2E suite (`caiac-ops-dashboard/tests/e2e/`)

**Install:** `npm install -D @playwright/test` in the ops dashboard repo.

**Config** (`playwright.config.ts`): target the staging ops dashboard URL (set in `.env.test` as `OPS_DASHBOARD_URL`). Auth by calling the staging signin endpoint, injecting the JWT into `localStorage` before each test.

**What it covers autonomously:**
- Panel opens when gear icon clicked, closes on outside click
- Tab navigation loads correct content per tab
- Feature toggle fires API call, optimistic flip, reverts on error (intercept + mock 500)
- Cap number input save → page reload → value persisted (real API call, DB assertion via db helper)
- Form save (notify email) → reload → persisted
- Analytics tab: all chart sections mount without error, timeframe selector changes request params
- Users tab: list renders, add-user form appears
- Empty states: no leads → correct empty state copy (not a broken chart)

**Run:** `npx playwright test` in `caiac-ops-dashboard/`. I can run this after every phase of the dashboard build.

**Separate suite for client dashboard** (`caiac-client-dashboard/tests/e2e/`): narrower scope — `AIUsageBar` renders when `advanced_ai` is on, absent when off; footer copy correct per `cloud_consent` value.

### 2 — Analytics seed fixtures (`tests/fixtures/analytics.ts`)

Without seed data, the analytics test can only assert shape — not correctness. This fixture inserts known rows into `automation_runs`, `ai_usage`, and `leads` for henderson, with deterministic values, then cleans up in `afterAll`.

Example seeded state for `admin-client-analytics.test.ts`:
- 10 leads this month, 6 with `qualification_score >= 7`, 4 with `crm_synced_at IS NOT NULL`
- 3 `automation_runs` with `automation_type = 'review_request'`: 3 sent, 2 responded, 1 positive
- 50 `ai_usage.request_count` for current period

Test then asserts the funnel numbers exactly: `lead_funnel.total = 10`, `qualified = 6`, etc. Brittle in a good way — any SQL change that breaks the computation fails immediately.

### 3 — HMAC sign helper (`tests/helpers/sign.ts`)

Handle Rating Click and review link webhooks are HMAC-signed (using `client_platform_config.link_signing_secret`). Without this, testing them requires a real click from a real email.

The helper:
```ts
import { createHmac } from 'crypto'

export function signReviewPayload(secret: string, payload: Record<string, string>): string {
  const body = new URLSearchParams(payload).toString()
  return createHmac('sha256', secret).update(body).digest('hex')
}
```

**Security note — shared DB means shared secrets:** Staging and prod share the same Postgres DB. `henderson`'s `link_signing_secret` in the test DB is the same value prod uses. A test that reads this secret and signs a payload can technically forge prod review clicks if pointed at the wrong URL. Mitigation:
- The sign helper always fires at `N8N_WEBHOOK_BASE` from `.env.test` — which must point to staging only, never prod
- Use a **dedicated test-only client** (not henderson) for sign helper tests, with its own `link_signing_secret` that isn't used by any real client. Add this client to the test seed script.
- Document in `.env.test.example`: "N8N_WEBHOOK_BASE must be staging URL — never point this at prod"

Then `reviews-rating-click.test.ts`:
1. Fetch the test-only client's `link_signing_secret` from DB via `db.queryOne`
2. Build a bad-rating payload (rating = 2)
3. Sign it with the helper
4. POST to the staging Handle Rating Click webhook with the `x-signature` header
5. Assert 200 response + DB state (e.g., followup email log or `automation_runs` row)

This makes Handle Rating Click fully automatable — no human needed.

### What requires .env.test additions

| Key | Purpose |
|---|---|
| `OPS_DASHBOARD_URL` | Playwright target for ops dashboard staging URL |
| `CLIENT_DASHBOARD_URL` | Playwright target for client dashboard staging URL |
| `TEST_STAFF_EMAIL` + `TEST_STAFF_PASSWORD` | Ops dashboard login for Playwright (can reuse existing test user) |

Everything else (DB connection, staging n8n URL, webhook base) already in `.env.test`.

### Security checklist for Playwright setup

- Add `playwright/.auth/` to `.gitignore` in both dashboard repos — Playwright saves auth state (JWTs) to disk; committing these is a credential leak
- `.env.test` is already gitignored — verify before first run: `git check-ignore -v .env.test`
- `N8N_WEBHOOK_BASE` in `.env.test` must be the staging URL — add a comment in `.env.test.example`: "⚠️ Never point this at prod — tests write real data to the shared DB"
- If tests ever run in CI (GitHub Actions), move all `.env.test` values to GitHub Secrets and inject via `env:` in the workflow YAML — never hardcode credentials in CI config files

---

## Test Data / Seeding

### Shared DB risk

**Staging and prod share the same Postgres DB.** This means test data inserted during a test run is immediately visible in production queries if cleanup fails. Henderson is a real client in the shared DB — its analytics numbers appear in the prod ops dashboard.

Mitigation strategy:
1. **Tag all test rows** with `intake_data->>'_source' = 'test-analytics'` (or equivalent per table)
2. **Global teardown** in `tests/setup.ts` — add a `globalTeardown` export that deletes all tagged test rows on process exit, even if individual `afterAll` blocks crash
3. **Nightly Cleanup job** — add a step to `CAIAC Maintenance - Nightly Cleanup v1.0.0` that deletes `source = 'test-*'` rows older than 1 hour from all test-tagged tables. Belt and suspenders.

### henderson test client — current state

Henderson is the designated test client. The `tests/` suite currently inserts leads with `source = 'test-suite'` and deletes them in `afterEach`. For analytics tests, we need persistent baseline data or fixture-managed seed data.

### Seeding strategy

Use a `beforeAll` / `afterAll` pattern with a `source = 'test-analytics'` tag on all seeded rows:

```ts
// tests/fixtures/analytics.ts
export async function seedAnalyticsData(clientId: string) {
  await db.query(`
    INSERT INTO caiac.leads (client_id, crm_type, source_id, source_channel, lifecycle_stage, qualification_score, crm_synced_at, intake_data)
    VALUES
      ($1, 'sheet', 'test-1', 'tally', 'intake', 8, NOW(), '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-2', 'tally', 'intake', 5, NULL,  '{"_source":"test-analytics"}'),
      ... -- 10 rows total
  `, [clientId])

  // automation_runs referencing the seeded lead IDs
  await db.query(`INSERT INTO caiac.automation_runs ...`)

  // ai_usage for current period
  await db.query(`
    INSERT INTO caiac.ai_usage (client_id, period, request_count)
    VALUES ($1, $2, 50)
    ON CONFLICT (client_id, period) DO UPDATE SET request_count = 50
  `, [clientId, currentPeriod()])
}

export async function cleanAnalyticsData(clientId: string) {
  await db.query(`DELETE FROM caiac.leads WHERE client_id = $1 AND intake_data->>'_source' = 'test-analytics'`, [clientId])
  await db.query(`DELETE FROM caiac.automation_runs WHERE lead_id IN (SELECT id FROM caiac.leads WHERE ...)`)
  await db.query(`DELETE FROM caiac.ai_usage WHERE client_id = $1 AND period = $2`, [clientId, currentPeriod()])
}
```

Analytics test then calls `seedAnalyticsData` in `beforeAll`, `cleanAnalyticsData` in `afterAll`, and asserts exact funnel numbers.

---

## Security Checklist

Every item here must be verified before any Phase 2 workflow ships to prod.

| # | Item | Where |
|---|---|---|
| 1 | All new admin workflows call `[Utility] Full Auth v2.0.0` and assert staff role before any DB access | Each Phase 2 workflow |
| 2 | `[Admin] Platform Overview` rejects client-level JWTs (cross-client data) | `Check Staff Auth` node |
| 3 | `[Client] Get AI Usage` derives `client_id` from JWT only — no `?slug` override possible | `Normalize Auth` node |
| 4 | `[Admin] Manage Client User` sets `saveDataSuccessExecution: "none"` | Workflow settings |
| 5 | `[Admin] Manage Client User` scopes all user queries to the requested client_id (cross-client isolation) | Every DB query in the workflow |
| 6 | `[Admin] Get AI Usage` SQL injection fix deployed (parameterized `slug`) | `Query AI Usage` node |
| 7 | All new workflows use parameterized Postgres queries — no user input interpolated into SQL strings | Every Postgres node |
| 8 | `link_signing_secret` is read-only in platform config — no POST field for it | `[Admin] Get/Update Client Platform Config` |
| 9 | Tally Step 3 "Send Test Lead" routes through `admin-tally-test-lead.ts` CF Function — browser never touches signing secret | CF Function |
| 10 | `playwright/.auth/` added to `.gitignore` in both dashboard repos before first Playwright run | Repo setup |
| 11 | `.env.test` `N8N_WEBHOOK_BASE` is staging URL, documented with warning in `.env.test.example` | Dev setup |
| 12 | Nightly Cleanup job has a step to delete `source = 'test-*'` rows older than 1 hour | `CAIAC Maintenance - Nightly Cleanup v1.0.0` |

---

## Open Items

- [ ] **Offboard workflow** — Danger Zone button disabled until `[Admin] Offboard Client v1.0.0` is built. Add to OPEN_ITEMS when this plan ships.
- [ ] **Review threshold column** — `review_min_rating INT DEFAULT 4` should be added alongside migration 1 (also additive, safe anytime). Decide before building Reviews tab.
- [ ] **Review threshold enforcement** — `[Reviews] Handle Rating Click v1.0.0` → `Check Rating Type` IF node needs to read `review_min_rating` from DB instead of any hardcoded value. Audit that node before building Reviews tab UI.
- [ ] **Handle Rating Click staging version** — needed before touching the prod workflow for migration 2. Deploy to staging, add test, then modify.