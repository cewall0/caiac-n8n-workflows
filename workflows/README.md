# Workflow Registry

Central inventory of all active n8n workflows. **Claude maintains this file.** Update it whenever a workflow is created, versioned, activated, deactivated, or deleted.

> **IDs listed below are production IDs** (`flows.caiacdigital.com`). Staging IDs differ — the JSON file contains the staging ID. Verify any ID via `n8n_list_workflows` or `n8n_get_workflow` before relying on it.

---

## How to Read This Registry

- **Status:** `active` = deployed and live | `staging` = exists in staging only | `pending-deactivate` = superseded, still running | `deactivated` = off
- **Calls:** sub-workflows this workflow invokes via Execute Workflow node
- **Called by:** workflows that invoke this one
- **File:** corresponding JSON in `workflows/` (prod export)

---

## Auth Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Utility] Full Auth v2.0.0` | `XWbmBI9NYdwK80eg` | `full-auth-v2.0.0.json` | active | Called by all protected webhooks to validate JWT + return features |
| `CAIAC Auth - Signin v2.0.0` | `E9aHZeoUdtpguTaD` | `auth-signin-v2.0.0.json` | active | — |
| `CAIAC Auth - Refresh v2.0.0` | `ZCCKeovM47Z3UNNb` | `auth-refresh-v2.0.0.json` | active | Staging ID: `bcb3HSG2Qsq66kdA` |
| `CAIAC Auth - Signout v1.0.0` | `Q0i9qGzfEanRayou` | `auth-signout-v1.0.0.json` | active | Staging ID: `WbLLp4gGzA3j7VQA` |
| `CAIAC Auth - Change Password v1.0.0` | `qKqrfdGqY21WxkYw` | `auth-change-password-v1.0.0.json` | active | — |
| `[Utility] Validate Auth v1.0.0` | `25FQf7oSGTBlLXqz` | `validate-auth-v1.0.0.json` | pending-deactivate | Pre-JWT auth, superseded by Full Auth v2.0.0. Deactivate once confirmed no callers. |

---

## Intake Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Intake] CAIAC Lead Capture v2.1.0` | `FXGmlYKi5Wy1QKX6` | `intake-lead-capture-v2.1.0.json` | active | Owner SMS + email notification routing (`lead_notify_method`: email/sms/both/none). Reads `notify_phone` + `lead_notify_method` from client config. Staging ID: `R7gqIqrJhu3ADtGg`. |
| `CAIAC Demo - Lead Capture v1.2.0` | `Z6hV4ALmmPL4IdAr` | `lead-capture-v1.2.0.json` | deactivated | Inactive in prod — remove from n8n when confirmed safe |
| `[Intake] Lead Capture v1.0.0` | `5eVBapje2TWpeMvj` | — | deactivated | Old version, inactive in prod |

**Calls:** `[Utility] Score Lead v1.0.0`, `[Utility] Send Email v1.0.0`, `[Utility] Send SMS v1.0.0`

---

## Chat / RAG Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `CAIAC RAG - Chat v2.6.0` | `kgEgpT7XL7KuKD0z` | `rag-chat-v2.6.0.json` | active | Adds Claude/Ollama model selection, cap enforcement, quick_action_key logging. Staging ID: `kvu3hOiGTiuvbVlQ`. Uses "Anthropic API" credential (anthropicApi type). Dual entry: webhook (`caiac/chat/v26`) + sub-workflow trigger. |
| `[Chat] Public Gateway v1.0.0` | `GQx5Rx8sGGTQIeqi` | `chat-public-gateway-v1.0.0.json` | active | Universal unauthenticated public chat endpoint. POST /webhook/public/chat with `{client_slug, message, session_id}`. Security: origin allowlist, feature flag, session/IP/burst/monthly rate limits. Calls v2.6.0 as sub-workflow. Staging ID: `Dx66lBVvq3miqCjJ`. |
| `CAIAC RAG - Chat v2.5.0` | `eZv65sCV7njNG49Z` | — | pending-deactivate | Superseded by v2.6.0 (deployed 2026-06-26). Deactivate once confirmed no active callers. |
| `CAIAC RAG - Chat v2.4.1` | `Wdn95E6Yr6miEHeO` | — | pending-deactivate | Still on main path. Had a direct-response bypass (`Route Request`) that v2.5.0 removed — confirm not relied on before deactivating |
| `CAIAC RAG - Chat History v1.0.0` | `lg0FwGFmDWlvDc3F` | — | active | Returns chat session history |
| `CAIAC RAG - Chat Messages v1.0.0` | `WZf89hltWqqZJfyP` | — | active | Returns messages for a session |
| `CAIAC RAG - Chat Delete v1.0.0` | `lTdAyxPct3gXG8FA` | — | active | Deletes a chat session |
| `CAIAC RAG - Promote v1.0.0` | `an4KO3aq9pLj5EDx` | — | active | Promotes a document chunk |
| `CAIAC RAG - Dismiss v1.0.0` | `O47BEXbwx3UuhETz` | — | active | Dismisses a document chunk |

---

## Onboarding Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Onboarding] CAIAC Client Agent v1.0.0` | `HdNvh02lpP6dV059` | `onboarding-client-agent-v1.0.0.json` | active | Main onboarding agent — orchestrates all provisioning steps via tools. Staging ID: `JL0VyZfcaHl7xI4W`. |
| `[Onboarding] Create Client Record v1.0.0` | `AvNGCwKF3BtOLl2Y` | `onboarding-create-client-record-v1.0.0.json` | active | Tool: creates `caiac.clients` row. Staging ID: `RIPqG2iJUtIo4p9Z`. |
| `[Onboarding] Create Client Lead Sheet v1.0.0` | `WL6OUEmJ4Z5ZGsr8` | — | pending-deactivate | Reviews system sheet setup. Being replaced by `Setup Client Sheet`. Deactivate after agent cutover. |
| `[Onboarding] Create Lead Sheet v1.0.0` | `mXtKgZzK7Ppncywr` | — | pending-deactivate | Called by onboarding agent. Being replaced by `Setup Client Sheet`. Deactivate after agent cutover. |
| `[Onboarding] Get Client State v1.0.0` | `opOrQB7kDGlEE8so` | — | active | Returns client provisioning state by slug. Called by agent at start of every session for re-entrancy. |
| `[Onboarding] Generate Field Map v1.0.0` | `dD39CCxzxczQ8820` | — | active | Converts field list to field_map JSON string + tally_fields array. Called by agent before create_client. Staging ID: `qrW9GtAE0u2nuvQW`. |
| `[Onboarding] Setup Client Sheet v1.0.0` | `qS8R4WROB0zrJppB` | `onboarding-setup-client-sheet-v1.0.0.json` | active | Creates sheet with Lead Information (field_map headers) + Review Status tabs. Upserts both clients.config and client_platform_config. Uses "Caiac Group Sheets" credential. Staging ID: `vKsMlkHGdmismc91`. |
| `[Onboarding] Create Client User v1.0.0` | `8MnKBfVjMUrvbmMq` | — | active | Tool: creates user record in DB. Staging ID: `6X6IDrQ0A2RZsevW`. |
| `[Onboarding] Stub CRM Config v1.0.0` | `8AZ4sMI7CRXByH8I` | — | active | Tool: creates empty CRM config row. Staging ID: `YaE38mJ9tpZVG0Ep`. |
| `[Onboarding] Seed Client Features v1.0.0` | `lCCkJfPFbNNbHWiI` | — | active | Tool: inserts default feature rows into `caiac.client_features`. Core (enabled): chat, reviews, intake. Add-ons (disabled): crm_sync, lead_scoring, sms, advanced_ai, public_chat. Staging ID: `Wz7eoejAhrs4u6Xn`. |
| `[Onboarding] Enable Feature v1.0.0` | `ZlpKZ33mNhU3ek24` | — | active | Tool: upserts `client_features` to enable a specific feature. Staging ID: `9BxuTHAipJJXvM45`. Called by agent after client opts in to advanced_ai |
| `[Onboarding] Set Quick Actions v1.0.0` | `AhYVwYN7hi0Tti0y` | — | active | Tool: writes `quick_actions` array to `clients.config`. Staging ID: `AzMs6ZLtEPm5pBf3`. Called by agent after collecting quick action selections |
| `[Onboarding] Send Welcome Email v1.0.0` | `Gh2FE8DSQbulc4hL` | — | active | Tool: sends welcome email. Staging ID: `VENqIUwY5zVLSNq2`. |
| `[Onboarding] Smoke Test v1.0.0` | `1Wmm68uc0ZnWegVK` | — | active | Tool: verifies client row, sheet, users exist. Staging ID: `BsCI6lWLewTmBdHS`. |

**All onboarding sub-workflows are called by:** `[Onboarding] CAIAC Client Agent v1.0.0` via `toolWorkflow` nodes.

---

## Reviews Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Reviews] Poll Sheets For Completed Leads v1.0.0` | `rsuysKkzQZ3Muse2` | `poll-sheets-for-completed-leads-v1.0.0.json` | active | Scheduled — triggers Process Completed Lead for each eligible sheet row |
| `[Reviews] Process Completed Lead v1.0.0` | `9TiCOFBEFCksLWyM` | — | active | Core review processor — source-agnostic |
| `[Reviews] Handle Rating Click v1.0.0` | `XSQemRjTkLP0D15x` | `handle-rating-click-v1.0.0.json` | active | Webhook: client clicks review link. Updated 2026-06-29: review_notify_email, routing bug fixed. |
| `[Reviews] Check Review Link Health v1.0.0` | `qicDCvaDemfb9gdw` | — | active | — |

---

## Admin Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Admin] Update Feature Config v1.0.0` | `9QBwwqPa0rDP2p5S` | `update-feature-config-v1.0.0.json` | active | Staff-only: update config JSONB on client_features (e.g. AI cap). POST /admin/update-feature-config `{slug, feature, config}`. KNOWN_FEATURES allowlist. Staging ID: `0umq3oRX4zqCh60f`. |
| `[Admin] Get Client Errors v1.0.0` | `uMqiM9as9lUz4Yx3` | `get-client-errors-v1.0.0.json` | active | Staff-only: recent error_log entries for a client. GET /admin/client-errors?slug=X&limit=10. Staging ID: `hsRbHjUFvQAUVXau`. |
| `[Admin] Platform Overview v1.0.0` | `YlARqDrakkVnrJ7N` | `platform-overview-v1.0.0.json` | active | Staff-only, rejects client JWTs: cross-client stat chips. GET /admin/platform-overview. Returns active_clients, leads_this_month, automations_this_month, clients_near_cap, errors_last_24h. Staging ID: `V5xv5ni6mBcb3tGf`. |
| `[Admin] Get Client Analytics v1.0.0` | `WZ2lN2Q4fkepQ8sp` | `get-client-analytics-v1.0.0.json` | active | Staff-only: per-client lead funnel, AI trend, review funnel, ROI score. GET /admin/client-analytics?slug=X&months=3. Staging ID: `okXdefXDq3HXrGzx`. |
| `[Admin] Toggle Client Feature v1.0.0` | `QO47fCP6XNuLyS0i` | — | active | Staff-only: enable/disable per-client features. `KNOWN_FEATURES`: chat, reviews, intake, crm_sync, lead_scoring, sms, advanced_ai, public_chat. Staging ID: `5gZWZmOWQdcA4XNV`. |
| `[Admin] Update Client Config v1.0.0` | `b8StToReJzg1bzKp` | — | active | Staff-only: update field_map, notify_email, sheet_id, quick_actions, notify_phone, lead_notify_method. Staging ID: `wPEc3WK7Jt7w2UUg`. |
| `[Admin] Get DB Schema v1.0.0` | — | — | staging | Dev tool — returns live columns + constraints for any caiac table. Staging ID: `6RE9D1dQYKeus9a0`. Stays in staging only. Requires `CAIAC_ADMIN_KEY` env var. See CLAUDE.md DB Schema Backup section. |
| `[Admin] Get AI Usage v1.0.0` | — | — | staging | Returns Claude usage vs cap per client for current or specified month. Staging ID: `STsGoDCDUJhjBgEE`. GET `/admin/ai-usage?period=YYYY-MM&slug=optional` |
| `[Admin] Get Quick Action Usage v1.0.0` | — | — | staging | Returns button use_count per client sorted stale-first. Staging ID: `31C8gxuPexzVWIrH`. GET `/admin/quick-action-usage?period=YYYY-MM&slug=optional` |
| `CAIAC Admin Health v1.0.0` | `leu2rERglqIqzhAj` | `admin-client-health-check.json` | active | Ops dashboard health endpoint — Qdrant + RAG stats |
| `[Admin] Client Health Check v1.0.0` | `i28p9CZu2RnCsWYQ` | `admin-client-health-check-v1.0.0.json` | active | Client dashboard health endpoint — per-client RAG health |
| `[Admin] List Clients v1.0.0` | `cO21HmBydG7gh9J9` | `admin-list-clients.json` | active | — |
| `[Admin] List Client Documents v1.0.0` | `FQfeOp3yZfLwnuFf` | `admin-list-client-documents.json` | active | — |
| `[Admin] Ingest Document v1.0.0` | `0VTWcZB0P0oTFo9c` | — | active | RAG ingestion pipeline |
| `[Admin] Ingest Preview v1.0.0` | `cM7pw170pRGfCWQV` | — | active | Preview ingestion result without committing |
| `[Admin] Delete Document v1.0.0` | `uPCEN5Kf7bkyR5qv` | — | active | Removes document + vectors from Qdrant |
| `[Admin] Run Ragas Eval v2.0.0` | `b9GEiJleW09eA5YO` | — | active | Runs RAG quality evaluation |
| `[Admin] Eval Status (v1.0.0)` | `FEGd6dvYVn5Gb6UJ` | — | active | Returns status of a running eval job |
| `[Admin] Delete Leads v1.0.0` | `SXjd5Iv3jY7uVope` | `admin-delete-leads-v1.0.0.json` | active | Staff-only: hard-delete lead records by ID array. Requires staff JWT. |
| `[Admin] Get Onboarding State v1.0.0` | `QLnMno5sG7wWbRp9` | `admin-get-onboarding-state-v1.0.0.json` | active | Staff-only: returns provisioning step status + features for a client. GET /caiac/admin/onboarding-state?slug=X. Thin wrapper around Get Client State. |
| `[Admin] Disable Client v1.0.0` | `1h0kLNBrUCu2rvCL` | `admin-disable-client-v1.0.0.json` | active | Staff-only: sets client active=false. POST /caiac/admin/disable-client `{slug, confirm}`. Type-to-confirm required. |
| `[Admin] Rerun Onboarding Step v1.0.0` | `WIfESJ3Baya7tFhl` | `admin-rerun-onboarding-step-v1.0.0.json` | active | Staff-only: reruns seed_features, stub_crm_config, or smoke_test. POST /caiac/admin/rerun-onboarding-step `{slug, step, params?}`. |
| `[Admin] Onboarding Chat v1.0.0` | `4hLdcY8URF8MJix8` | `admin-onboarding-chat-v1.0.0.json` | active | Staff-only: webhook-triggered AI provisioning agent (same tools as Client Agent). POST /caiac/admin/onboarding-chat `{message, session_id}`. |
| `[Admin] Test RAG Query v1.0.0` | `KeikQAANLZJrb3dB` | `admin-test-rag-query-v1.0.0.json` | active | Staff-only: runs similarity search against client Qdrant collection. POST /caiac/admin/test-rag-query `{slug, query}`. |

---

## Client Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Client] Public Config v1.0.0` | `eKe1UmMNCOsLp4vz` | — | active | Returns public client config (branding, enabled features, **resolved quick_actions with prompts**). Staging updated — deploy when Chat v2.6.0 deploys |

---

## Utility Layer

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `[Utility] Score Lead v1.0.0` | `6lzuSE2b7txCLWm2` | `utility-score-lead-v1.0.0.json` | active | Claude-based lead scoring; called by Lead Capture. Staging ID: `TgIGx96aDK3T0m80`. |
| `[Utility] CRM Create Lead v1.0.0` | `g7Gbsift1PZ085PH` | — | active | Routes lead creation to client CRM. Interface changing: (client_id, lead_id) replacing flat fields — see `.claude/plans/lead-data-architecture.md` Phase 3 |
| `[Utility] Handle Workflow Error v1.0.0` | `hZk1sE4UP2Vmn5QV` | — | active | Error trigger handler — sends alert on workflow failure. Staging ID: `BKjnZ73xtJ0LAMvH`. |
| `[Utility] Get Client Review Config v1.0.0` | `D7eHaKwQCqYLbjlh` | — | active | — |
| `[Utility] Sign Review Token v1.0.0` | `O60CFCYZdAGLXZkW` | — | active | — |
| `[Utility] Update Lead Sheet Row v1.0.0` | `ySf9npJlqi23yjXK` | — | active | — |
| `[Utility] Mark Review Sent v1.0.0` | `zHqk2CNsXQX6K1Bn` | — | active | — |
| `[Utility] Record Rating v1.0.0` | `eQeYbCkCLYaNvG83` | — | active | — |
| `[Utility] Send Email v1.0.0` | `tdI7VopcP5vpet6J` | `utility-send-email-v1.0.0.json` | active | Central email sub-workflow (SendGrid). All email sending routes here — never call SendGrid directly. Staging ID: `3EqT2kq1Qc9bKLkb`. |
| `[Utility] Send SMS v1.0.0` | `5GxBQucu4Wr62JV8` | `utility-send-sms-v1.0.0.json` | active | Send single SMS via Telnyx. Inputs: `to`, `from`, `body` (all E.164/string). Credential: "Telnyx API" (httpBearerAuth). Staging ID: `qzycMgk9pK0lOpdt`. |
| `[Utility] Log AI Usage v1.0.0` | — | — | staging | Upserts `caiac.ai_usage` (Claude call count per client per month). Staging ID: `42DIkRKLfAIzHPOK`. Called inline from Chat v2.6.0 |

---

## Scheduled / Infrastructure

| Workflow | Prod ID | File | Status | Notes |
|---|---|---|---|---|
| `CAIAC Maintenance - Nightly Cleanup v1.0.0` | `FpYhLFjFD0xpSfNf` | — | active | See OPEN_ITEMS — `Delete Expired Sessions` node should be removed |

---

## Quote Layer (Wallace Exterior / Mason)

| Workflow | Prod ID | Staging ID | File | Status | Notes |
|---|---|---|---|---|---|
| `[Quote] Exterior Services Bot v1.0.0` | `3k7yigRxzwdbwkQM` | `IF475ALtqEp8mxeV` | `exterior-services-bot-v1.0.0.json` | active | Main quote chatbot. Chat URL: `https://flows.caiacdigital.com/webhook/523d1720-bd71-4487-ae67-beae74fbc2b7/chat`. hostedChat trigger → Sheets pricing → Build System Prompt → AI Agent. Photo upload path: binary → Claude Vision → injects analysis. Tools: analyze_photo + calculate_travel. Credentials: `Anthropic API`, `Caiac Group Sheets`. |
| `[Quote] Analyze Photo v1.0.0` | `65R26MvXh1I8Kyfe` | `5yNAyf8uXyCra84c` | `analyze-photo-v1.0.0.json` | active | Sub-workflow: analyzes house exterior photos via Claude Haiku Vision. analysis_type: windows/concrete/christmas_lights/gutters. Called by Exterior Services Bot when customer provides a hosted image URL. |
| `[Quote] Calculate Travel v1.0.0` | `mFjRjxB8jTuLyMD0` | `tRUreioZti8PkbC3` | `calculate-travel-v1.0.0.json` | active | Sub-workflow: Google Maps Distance Matrix API → travel zone + fee. Origin hardcoded to Mason's base (6806 S 25 E, Pendleton, IN). travel_fee=-1 means out of service area. Credential: `Google Maps API`. **Note:** Distance Matrix API must be enabled in GCP for this to work — test after enabling. |

**Calls (Exterior Services Bot):** `[Quote] Analyze Photo v1.0.0`, `[Quote] Calculate Travel v1.0.0`

---

## Quote Layer (Apex Roofing / demo-roofing)

| Workflow | Prod ID | Staging ID | File | Status | Notes |
|---|---|---|---|---|---|
| `[Quote] Roofing Bot v1.0.0` | `IqQiQQeuQOx8J3CH` | `kjcF7vky0kRFlrcK` | `roofing-bot-v1.0.0.json` | active | Main quote chatbot for demo client Apex Roofing (`demo-roofing` slug). Chat Trigger (hostedChat, public) → Sheets pricing ("Apex Roofing Pricing" doc, `Quote-Pricing` tab) → Build System Prompt → AI Agent (Claude Sonnet 4.6). Tool: `analyze_roof`. Credentials: `Anthropic API`, `Caiac Group Sheets`. Tested end-to-end via chat on staging + prod — full itemized quote math and markdown table rendering verified correct. Prod webhook: `40867111-9643-4156-8d67-fecf9b23cb93`. `saveDataSuccessExecution: none` (address is PII). Embedded live on caiacdigital.com (pending CF deploy secrets — see `OPEN_ITEMS.md`). |
| `[Quote] Analyze Roof v1.0.0` | `SpUoB6qcBUZVpdAU` | `yYN9GQnpZ32ErQIz` | `analyze-roof-v1.0.0.json` | active | Sub-workflow: geocodes customer address → satellite image (Google Static Maps, zoom 20) + Street View image (if coverage exists, via Street View Static Metadata check) → Claude Vision (claude-sonnet-4-6) analyzes both images (satellite for footprint/facets/features, Street View for **directly observing** roof pitch instead of inferring from shadows) → applies pitch-multiplier + waste-factor math. Falls back to satellite-only indirect pitch inference when no Street View coverage. Also computes travel fee via haversine distance from Apex's base address (reuses the geocode call, no 2nd Maps API hit). Credentials: `Google Maps API` (requires Geocoding, Static Maps, Street View Static, and Street View Static Metadata APIs all enabled; key IP-restricted to `178.156.235.122`), `Anthropic API`. `saveDataSuccessExecution: none` (address is PII). |

**Calls (Roofing Bot):** `[Quote] Analyze Roof v1.0.0`

**Pricing sheet:** "Apex Roofing Pricing" — tab `Quote-Pricing` (`1S5J_lxEGt-raDqCNRxM9icwhaGbiGlvTBOHAptcHpfM`). Built from professional roofing-industry pricing conventions (demo placeholder $ values, not real Apex numbers) — material tiers, pitch-based area multiplier, complexity/waste factor, steep-slope surcharge, tear-off/disposal, permit, feature surcharges, minimum job price, travel zones.

**Known n8n quirk (this instance):** binary data is stored on filesystem; Code nodes must read binary via `await this.helpers.getBinaryDataBuffer(itemIndex, propertyName)`, not `item.binary[key].data` (that's just a storage reference here) and not `$helpers` (undefined in this instance's sandbox). This was a real bug in prod `[Quote] Analyze Photo v1.0.0` — fixed 2026-07-02.

---

## Maintenance Rules (for Claude)

1. **On workflow create** — add a row to the correct table above. Leave Prod ID as `—` until deployed to prod.
2. **On prod deploy** — fill in the Prod ID column.
3. **On version bump** — add the new row, move old row to `pending-deactivate`, set File to the new JSON filename.
4. **On deactivation** — change status to `deactivated`; remove row after the next session confirms it's gone from n8n.
5. **Missing `—` IDs** — fill them in when you have MCP access via `n8n_list_workflows`.
