# Open Items

Trailing tasks and unresolved questions from past sessions. Claude maintains this — add when discovered, remove when resolved.

---

## DB Migration — Step 3 Still Pending

- **`caiac.leads` drop redundant columns** — Steps 1 + 2 ran 2026-06-25. Step 3 (drop `crm_type` + `source_id`) must happen AFTER Lead Capture no longer writes to those columns. v2.1.0 still uses intermediate SQL that writes them. SQL:
  ```sql
  ALTER TABLE caiac.leads DROP COLUMN IF EXISTS crm_type;
  ALTER TABLE caiac.leads DROP COLUMN IF EXISTS source_id;
  ```
  Run this when v2.2.0 ships (final SQL without those column writes) or when they are manually removed from v2.1.0.

---

## Repo Setup — Needs cewall0 (Admin)

- **Branch protection on `main` — all 4 repos** — set in GitHub UI: Settings → Branches → Add rule for `main` → require PR, require status checks, block direct pushes. Do after CI has run at least once so the check appears in the dropdown.

- **`caiac-website` confirmed missing CF deploy secrets (2026-07-02)** — `Deploy to Production` workflow failed on push to `main`: `CLOUDFLARE_API_TOKEN environment variable` not set. PR #9 (roofing quote demo) merged successfully but the deploy step failed — code is in `main`, not live on caiacdigital.com yet. Fix: add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in GitHub repo Settings → Secrets and variables → Actions (same Cloudflare account as `caiac-ops-dashboard`). Once set, re-run the failed workflow — no new PR needed. Still need to check `caiac-client-dashboard` for the same gap.

---

## PII Compliance — Required (Lead Capture v2.1.0 Is Now Live)

`[Intake] Lead Capture v2.1.0` shipped 2026-06-26 and is writing PII to `caiac.leads`. `saveDataSuccessExecution` was reverted to `"all"` (2026-06-26) — PII retention is handled via n8n global log pruning instead. The items below are still required. Full context in `docs/pii-and-compliance.md`.

- **Privacy policy on caiac-website** — Draft at `src/routes/privacy.tsx` (draft banner + noindex). Footer link commented out in `index.tsx`. **To publish:** legal review → remove banner + noindex → uncomment footer link → deploy.

- **DPA clause in client agreements** — Draft at `docs/dpa-clause.md`. **To publish:** complete review checklist in that file (legal review, subprocessor list, retention confirmation).

- **Data retention: decide retention period** — Recommended: 90 days after client churn. Implement as a `DELETE FROM caiac.leads WHERE client_id IN (SELECT id FROM caiac.clients WHERE active=false AND updated_at < NOW() - INTERVAL '90 days')` job in Nightly Cleanup.

- **Breach response plan** — Document the steps (rotate creds, scope breach, notify affected individuals, notify clients). Owner: cewall0 + Luke.

---


## Chat Error Handler — Auth Failures Show Wrong Message

When `Call Full Auth` throws "Invalid or expired token", the Error Trigger fires in a **separate execution context** with no open webhook connection. `Respond 401 Unauthorized` (respondToWebhook) fails with "No Webhook node found in the workflow" — so no response gets sent, n8n returns a 500, and the frontend shows "I couldn't reach the knowledge base" instead of "Your session has expired."

**Root cause:** `respondToWebhook` cannot be called from an Error Trigger execution — the webhook session only exists in the original execution.

**Fix options (pick one):**
1. Replace the Error Trigger approach with a Try/Catch structure inside the main webhook execution path (n8n doesn't have native try/catch but can be simulated with `continueOnFail` + IF node)
2. In `sendChatMessage` (`src/lib/api.ts`) check the response body for `{"error":"AUTH_EXPIRED"}` even on 500s and re-throw appropriately
3. Add a dedicated n8n sub-workflow that handles auth and returns a structured error object instead of throwing — the main workflow then checks and routes before reaching any AI nodes

**Seen in:** execution 6949/6951 on prod 2026-07-01. Affects all clients.

---

## ops-dashboard Lint CI — Blocking PR #6 Merge

12 ESLint errors preventing CI from passing on `caiac-ops-dashboard` PR #6 (dev → main). All are **pre-existing** (were failing before this PR):

- 11× "Calling setState synchronously within an effect" — affects `AIProviderConfig.tsx:61`, `AnalyticsTab.tsx:98`, `ClientConfigPanel.tsx:45,69`, `ClientInsights.tsx:70`, `FeatureStatusCard.tsx:31,37`, `OnboardingTab.tsx:98`, `OverviewTab.tsx:57`, `ReviewsTab.tsx:30`, `UsersTab.tsx:64`
- 1× `'MOCK_CONFIG' is defined but never used` — `tests/e2e/platform.spec.ts:1`

Fix: for each setState-in-effect error, move synchronous state init (`setProv/setStatus/etc`) out of the async callback and into the `useEffect` body itself. Remove the same call from the async function so it doesn't double-fire on manual refresh triggers.

CF Pages build is already passing — only the GitHub Actions lint job is blocking.

---

## Admin Workflow Error Handler Pattern

All admin n8n workflows use `Error Trigger → Respond 500 Error (respondToWebhook)`. This is structurally broken: the Error Trigger fires in a **separate execution context** and `respondToWebhook` cannot respond to the original HTTP request from there. n8n falls back to 200 empty body for any unexpected error.

Fixed in `[Admin] Get Client Config v1.0.0` (2026-07-01) with inline auth gate. Apply the same `onError: continueRegularOutput` + IF + Respond 4xx pattern to the remaining admin workflows when they next get touched:

- `[Admin] Get/Update Client Platform Config v1.0.0` (`7bECMgCmgR5JY2X3`)
- `[Admin] Manage Client User v1.0.0` (`ojCUXKjeiAWe2L7t`)
- `[Admin] Get Client Errors v1.0.0` (`uMqiM9as9lUz4Yx3`)
- `[Admin] Get Client Analytics v1.0.0` (`WZ2lN2Q4fkepQ8sp`)
- `[Admin] Update Feature Config v1.0.0` (`9QBwwqPa0rDP2p5S`)
- `[Admin] Platform Overview v1.0.0` (`YlARqDrakkVnrJ7N`)
- `[Admin] Toggle Client Feature v1.0.0`
- `[Admin] Update Client Config v1.0.0`

Not urgent — these don't fail in normal operation. The bug only surfaces when auth actually fails or DB errors occur.

---

## Planned / Not Yet Built

- **Lead Data Architecture — Phase 3 still pending** — Phases 1–2c and 4 all complete. Phase 4 shipped 2026-06-26: Lead Capture v2.1.0 live (`intake_data` JSONB in DB, dynamic field_map sheet row, reviews workflows updated for new 4-column Review Status tab). Remaining: Phase 3 — update `[Utility] CRM Create Lead v1.0.0` to new interface (`client_id` + `lead_id`, reads `intake_data` from DB). See `.claude/plans/lead-data-architecture.md`.

- **Onboarding smoke test** — Tally → Lead Capture v2.1.0 confirmed working in prod (multiple successful webhook runs as of 2026-06-27). Still need to run full onboarding flow through `[Onboarding] Smoke Test v1.0.0` (`1Wmm68uc0ZnWegVK`) to verify new client provisioning end-to-end. Technical blockers cleared 2026-06-20.

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


- **Export missing workflow JSON files** — many prod workflows have no file in `workflows/`. Export from prod and commit for: Chat layer (History, Messages, Delete, Promote, Dismiss), all Onboarding sub-workflows except Client Agent + Create Client Record, all Reviews layer, all Admin layer except existing 3, Client Public Config, Utility (CRM Create Lead, Handle Error, Get Review Config, Sign Token, Update Sheet Row, Mark Review Sent, Record Rating), Nightly Cleanup. (v2.4.1 + v2.5.0 added 2026-06-27.)

- **Clean up stale workflow JSON files** — once deactivations confirmed, remove: `validate-auth-v1.0.0.json` (when Validate Auth deactivated), `utility-send-email-v1.0.0.json` (if SendGrid replaced). `auth-signin-v1.3.1.json` already deleted this session.
