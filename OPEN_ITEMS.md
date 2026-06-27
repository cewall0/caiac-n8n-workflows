# Open Items

Trailing tasks and unresolved questions from past sessions. Claude maintains this — add when discovered, remove when resolved.

---

## Unverified DB State — Needs cewall0

- **`caiac.client_platform_config` PK migration** — Confirmed 2026-06-25 via live schema: both `client_slug TEXT NOT NULL` (first column, likely still PK) and `client_id UUID NOT NULL` exist. The `client_id` column was added but the PK was NOT migrated to it. `Setup Client Sheet` must use `ON CONFLICT (client_slug)` until cewall0 runs the PK swap. Coordinate before building `Setup Client Sheet`. Verify PK: `SELECT conname, contype FROM pg_constraint WHERE conrelid = 'caiac.client_platform_config'::regclass;`

---

## DB Migration — Step 3 Still Pending

- **`caiac.leads` drop redundant columns** — Steps 1 + 2 ran 2026-06-25. Step 3 (drop `crm_type` + `source_id`) must happen AFTER Lead Capture v2.1.0 is deployed to prod. SQL:
  ```sql
  ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_type;
  ALTER TABLE caiac.leads DROP COLUMN IF EXISTS source_id;
  ```
  Do NOT run this while Lead Capture v2.0.0 is still live — it still writes to those columns.

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

- **Lead Data Architecture — Phases 3 + 4 still pending** — Phases 1 (DB migration), 2a (Generate Field Map), 2b (Setup Client Sheet), 2c (Agent re-entrant update) all complete as of 2026-06-25. Remaining: Phase 3 — update `[Utility] CRM Create Lead v1.0.0` (new interface: client_id + lead_id); Phase 4 — Lead Capture v2.0.0 → v2.1.0 (writes intake_data JSONB, dynamic sheet row). See `.claude/plans/lead-data-architecture.md`.

- **Backfill `client_platform_config` for existing clients** — Henderson and window business (and any other partially-set-up clients) need `client_platform_config` rows created so they appear as `setup_sheet: true` in get_client_state. Use the onboarding agent's re-entrant flow (it will resume from where they left off). Read their existing sheet column headers first to derive their field_maps — the agent's `generate_field_map` tool handles the mapping.

- **CAIAC Tally form + intake smoke test** — Luke needs to configure the CAIAC Tally form and run an end-to-end test through `[Onboarding] Smoke Test v1.0.0` (`1Wmm68uc0ZnWegVK`). Technical blockers cleared 2026-06-20 (pgcrypto enabled, CAIAC_ENCRYPTION_KEY set, bcrypt replaced with pgcrypto in Create Client User).

- **Delete v2.4.1 + v2.5.0 from n8n** — both deactivated 2026-06-27. v2.6.0 (`kgEgpT7XL7KuKD0z`) is now live on `/caiac/chat`. Delete the old workflows from the n8n UI once v2.6.0 has run cleanly for a few days.

- **Rate limiting for Chat v2.6.0** (do after cutover settles) — Create `caiac.rate_limits (user_id UUID, window_start TIMESTAMPTZ, hit_count INT, PK (user_id, window_start))`, add increment + 429 guard after Check Token Valid, add cleanup to Nightly Cleanup.

- **Remove `Delete Expired Sessions` node from Nightly Cleanup** (`FpYhLFjFD0xpSfNf`) — prep for `caiac.sessions` table deprecation. Safe once confirmed no session-based auth flows remain.

- **`sms` feature flag** — `sms` is registered in toggle/seed workflows and the feature flag row exists. Note: `[Utility] Send SMS v1.0.0` is built and Lead Capture v2.1.0 already calls it via `lead_notify_method`. The feature flag guards a future client-facing SMS preference UI, not the notification utility itself. No action needed until that UI is built.

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

- **Lock down `wallace-chemistry` origin allowlist** — when the client is ready to restrict to `organicchemistryguide.com`, set `config.public_chat.allowed_origins = ["organicchemistryguide.com"]` via `[Admin] Update Client Config v1.0.0`. Currently open (empty list) for testing.

- **Wallace Chemistry textbook re-ingest** — split `OCME 12_31_25.docx` into chapter PDFs using `scripts/split_textbook.py`, then re-ingest each chapter via the admin dashboard with `do_table_structure: true` enabled. Improves table parsing in the RAG results. Pending Luke to run split_textbook.py on the docx.


- **Export missing workflow JSON files** — many prod workflows have no file in `workflows/`. Export from prod and commit for: Chat layer (v2.4.1, v2.5.0, History, Messages, Delete, Promote, Dismiss), all Onboarding sub-workflows except Client Agent + Create Client Record, all Reviews layer, all Admin layer except existing 3, Client Public Config, Utility (CRM Create Lead, Handle Error, Get Review Config, Sign Token, Update Sheet Row, Mark Review Sent, Record Rating), Nightly Cleanup.

- **Clean up stale workflow JSON files** — once deactivations confirmed, remove: `validate-auth-v1.0.0.json` (when Validate Auth deactivated), `utility-send-email-v1.0.0.json` (if SendGrid replaced). `auth-signin-v1.3.1.json` already deleted this session.
