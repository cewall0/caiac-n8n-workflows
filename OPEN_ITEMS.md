# Open Items

Trailing tasks and unresolved questions from past sessions. Claude maintains this — add when discovered, remove when resolved.

---

## Unverified DB State — Needs cewall0

- **`caiac.client_platform_config` PK migration** — Architecture doc planned migrating PK from `client_slug TEXT` to `client_id UUID`. Live prod workflow still uses `ON CONFLICT (client_slug)` — migration may not have run. Verify: `SELECT conname, contype FROM pg_constraint WHERE conrelid = 'caiac.client_platform_config'::regclass;`. If not done, coordinate with cewall0 before building `Setup Client Sheet`.

- **`caiac.ai_usage_log.client_id` type** — may still be TEXT (not UUID). Verify before any UUID join query: `SELECT data_type FROM information_schema.columns WHERE table_schema='caiac' AND table_name='ai_usage_log' AND column_name='client_id';`

---

## DB Migration — Needs cewall0

- **`caiac.leads` schema migration** — Add columns, replace UNIQUE constraint, then drop redundant columns. Full SQL with sequencing in `.claude/plans/lead-data-architecture.md` Phase 1. Short version:
  ```sql
  -- Step 1: Add new columns
  ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS intake_data JSONB;
  ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_external_id TEXT;
  ALTER TABLE caiac.leads ADD COLUMN IF NOT EXISTS crm_synced_at TIMESTAMPTZ;
  -- Step 2: Replace UNIQUE constraint (verify name first)
  ALTER TABLE caiac.leads DROP CONSTRAINT leads_client_id_crm_type_source_id_key;
  ALTER TABLE caiac.leads ADD CONSTRAINT leads_client_fingerprint_unique UNIQUE (client_id, intake_fingerprint);
  -- Step 3: Drop redundant columns (AFTER Lead Capture v2.1.0 deployed)
  ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_type;
  ALTER TABLE caiac.leads DROP COLUMN IF EXISTS source_id;
  ```
  `source_id` = duplicate of `intake_fingerprint`. `crm_type` on leads = always 'form', same as `source_channel`, confusing name. Verify constraint name with `SELECT conname FROM pg_constraint WHERE conrelid = 'caiac.leads'::regclass AND contype = 'u';`

---

## Repo Setup — Needs cewall0 (Admin)

- **Branch protection on `main` — all 4 repos** — cewall0 must set in GitHub UI per repo: Settings → Branches → Add rule for `main` → require PR, require status checks, block direct pushes. Do after CI has run at least once so the check appears in the dropdown.

- **GitHub Secrets — all 4 repos** — cewall0 must add to Settings → Secrets and variables → Actions in each repo: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Required for CI/CD deploy workflows to run.

---

## PII Compliance — Required Before Lead Data Ships

These must be done before `[Intake] Lead Capture v2.1.0` goes to prod (the version that writes `intake_data` to the DB). Full context in `docs/pii-and-compliance.md`.

- **n8n execution log setting on Lead Capture** — Set `saveDataSuccessExecution: "none"` in Lead Capture v2.1.0 workflow settings. Stops name/email/phone from persisting in n8n execution history. Error executions still save. Also set n8n global log pruning to 30 days (Settings → Log Pruning in n8n UI).

- **Privacy policy on caiac-website** — Disclose that CAIAC stores lead intake data on behalf of clients, retention period, and deletion rights. Update in `caiac-website` repo.

- **DPA clause in client agreements** — One paragraph: CAIAC is processor, client is controller; data used only to operate service; no third-party sharing; deletion assistance on request. Legal review recommended before finalizing.

- **Data retention: decide retention period** — Recommended: 90 days after client churn. Implement as a `DELETE FROM caiac.leads WHERE client_id IN (SELECT id FROM caiac.clients WHERE active=false AND updated_at < NOW() - INTERVAL '90 days')` job in Nightly Cleanup.

- **Breach response plan** — Document the steps (rotate creds, scope breach, notify affected individuals, notify clients). Owner: cewall0 + Luke.

---

## Planned / Not Yet Built

- **Lead Data Architecture — full build (4 phases)** — See `.claude/plans/lead-data-architecture.md`. Phase 1 (DB migration) is blocked on cewall0 above. After that, staging build order: Generate Field Map → Setup Client Sheet → update Agent → update CRM Create Lead → Lead Capture v2.1.0. Blocker resolved: `Create Client Lead Sheet` writes to `caiac.client_platform_config` (confirmed via MCP). `Setup Client Sheet` must write to both `caiac.clients.config` and `caiac.client_platform_config`. PII policy change requires explicit sign-off (see plan Phase 1).

- **CAIAC Tally form + intake smoke test** — Luke needs to configure the CAIAC Tally form and run an end-to-end test through `[Onboarding] Smoke Test v1.0.0` (`1Wmm68uc0ZnWegVK`). Technical blockers cleared 2026-06-20 (pgcrypto enabled, CAIAC_ENCRYPTION_KEY set, bcrypt replaced with pgcrypto in Create Client User).

- **Cut over Chat v2.5.0** — v2.5.0 (`eZv65sCV7njNG49Z`) is live in prod. Swap its webhook path to `/caiac/chat`, then deactivate v2.4.1 (`Wdn95E6Yr6miEHeO`). Note: v2.4.1 had a direct-response bypass (`Route Request` node) that v2.5.0 removed — confirm the client dashboard never triggered that path before deactivating.

- **Rate limiting for Chat v2.5.0** (do after cutover) — Create `caiac.rate_limits (user_id UUID, window_start TIMESTAMPTZ, hit_count INT, PK (user_id, window_start))`, add increment + 429 guard after Check Token Valid, add cleanup to Nightly Cleanup.

- **Remove `Delete Expired Sessions` node from Nightly Cleanup** (`FpYhLFjFD0xpSfNf`) — prep for `caiac.sessions` table deprecation. Safe once confirmed no session-based auth flows remain.

- **`sms` feature workflow** — Feature flag row exists and `sms` is registered in the toggle/seed workflows. The actual SMS workflow using Telnyx is not built yet. Guard pattern is ready — follow `docs/roles-and-features.md` checklist when building.

- **Chat v3.0** — Agentic redesign (intent routing, multi-query RAG, structured output). Deferred until Ollama model is upgraded to one that supports JSON mode. Plan documented in `.claude/plans/`.

---

## CRM Client Path — Not Built (prerequisite for first paying CRM client)

These are needed before any client using Pipedrive or Housecall Pro can use the reviews or automation system. Full context and sequencing in `docs/caiac-platform-architecture.md` Build Order.

- **`[Utility] CRM Get Contact v1.0.0`** — fetches lead PII from the CRM by `crm_external_id`. Needed by reviews DB path and any future automation that needs contact data for CRM-sync clients. Pipedrive + HCP branches first; Jobber later.

- **DB write-back branches in `Mark Review Sent` + `Record Rating`** — both currently have sheet-only logic. Add a DB branch that writes to `caiac.automation_runs` for CRM clients who don't have a sheet.

- **`[Utility] Update Lead DB Record v1.0.0`** — counterpart to `Update Lead Sheet Row` for CRM clients.

- **`[Reviews] Poll DB For Completed Leads v1.0.0`** — scheduled poller that reads `caiac.leads` directly (instead of a Google Sheet) to find leads ready for a review request. Required for CRM clients.

- **`[Sync] Pipedrive → caiac.leads v1.0.0`** — scheduled sync pulling updated contacts/deals from Pipedrive into `caiac.leads`. Triggers when first paying Pipedrive client is onboarded.

- **`[Admin] Offboard Client v1.0.0`** — sets `active = false` on client, marks open leads `lifecycle_stage = offboarded`. No deletes. Build before first client churn.

---

## Future / Low Priority

- **Review Status DB sync (Phase 5)** — After Lead Data Architecture ships: `Poll Sheets For Completed Leads` should write `review_status` back to `caiac.leads` when it reads `Booked` status. Requires `review_status TEXT` column migration. Keeps Sheet as client interface but adds DB as analytics source of truth.

- **Role-based feature visibility (Layer 2)** — `config JSONB` column in `client_features` is reserved for per-feature role visibility (e.g. `visible_to_roles: ["admin"]`). Not needed until client dashboard exposes feature controls. No migration needed when the time comes.

- **Backfill `score_lead` `client_id` in older leads** — Intake now passes `client_id` to Score Lead. Historical leads scored before this change have no `client_id` attribution in the token log. Low priority unless cost reporting by client becomes important.

- **Deactivate `[Utility] Validate Auth v1.0.0`** (`25FQf7oSGTBlLXqz`) — pre-JWT auth utility, still active. Confirm no callers remain then deactivate.

- **Deactivate `CAIAC Demo - Lead Capture v1.2.0`** (`Z6hV4ALmmPL4IdAr`) — already deactivated in n8n (active: false). Safe to delete from n8n and remove `lead-capture-v1.2.0.json` once confirmed no one references it.


- **Export missing workflow JSON files** — many prod workflows have no file in `workflows/`. Export from prod and commit for: Chat layer (v2.4.1, v2.5.0, History, Messages, Delete, Promote, Dismiss), all Onboarding sub-workflows except Client Agent + Create Client Record, all Reviews layer, all Admin layer except existing 3, Client Public Config, Utility (CRM Create Lead, Handle Error, Get Review Config, Sign Token, Update Sheet Row, Mark Review Sent, Record Rating), Nightly Cleanup.

- **Clean up stale workflow JSON files** — once deactivations confirmed, remove: `validate-auth-v1.0.0.json` (when Validate Auth deactivated), `utility-send-email-v1.0.0.json` (if SendGrid replaced). `auth-signin-v1.3.1.json` already deleted this session.
