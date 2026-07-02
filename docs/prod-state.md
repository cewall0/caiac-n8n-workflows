# Production State

> Auto-maintained by `/deploy`, `/fix-now`, and `/session-end` skills.
> Do not edit manually — run `/session-end` to reconcile after any session that touches prod.

**Last updated:** 2026-07-02 (session 3)

---

## Known Prod Bugs

- **`Caiac Group Sheets` (prod credential `aZpl46gLl1Uha2wW`) OAuth2 token expired — needs manual reconnect.** Discovered 2026-07-02 testing `[Quote] Roofing Bot v1.0.0` live on prod: `Read Pricing Sheet` node fails with "The credential 'Caiac Group Sheets' needs to be reconnected." This blocks **any** prod workflow that reads/writes Google Sheets with this credential — not just the roofing bot. Requires cewall0 (or whoever owns the Google account) to open the credential in the n8n UI (Settings → Credentials → Caiac Group Sheets) and re-authorize via the OAuth consent flow — Claude cannot do this via MCP/API. **Roofing Bot chat is active on prod but will error on every message until this is fixed.**

**Fixed 2026-07-02 (session 3):** `[Quote] Analyze Photo v1.0.0` (prod `65R26MvXh1I8Kyfe`, v2) — binary-read bug (`binary.data` returned a filesystem storage reference, not the actual base64 payload, on n8n instances using filesystem binary storage). Fixed on staging (`5yNAyf8uXyCra84c`) and prod using `await this.helpers.getBinaryDataBuffer(0, binaryKey)`. Verified in isolation with a real image fetch before deploying to prod.

---


## Staged But Not On Prod

### n8n Workflows

| Workflow | Staging ID | Blocked by |
|---|---|---|
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | **Stays staging-only** (dev tool) |
| `[Utility] CRM Create Lead v1.0.0` (new interface) | `YbGsqynXbfoWgxec` | Test with lead that has non-null `intake_data` |
| `[Onboarding] Get Client State v1.0.0` (SQL injection fix) | `PNQCPQgVIHJqK1Qw` | Deploy when convenient — low-urgency security hardening |
| `[Quote] Roofing Bot v1.0.0` | `IqQiQQeuQOx8J3CH` | **Deployed to prod, not yet activated** — say "activate Roofing Bot on prod" to go live |

**Deployed to prod 2026-07-02 (session 3) — standalone AI roofing quote bot for demo client Apex Roofing (`demo-roofing`):**
- `[Quote] Roofing Bot v1.0.0` (prod `IqQiQQeuQOx8J3CH`, staging `kjcF7vky0kRFlrcK`): Chat Trigger → Sheets pricing → Build System Prompt → AI Agent (Claude Sonnet 4.6), tool `analyze_roof`. Tested end-to-end via chat on staging — itemized quote math verified correct against pricing sheet. **Created on prod but inactive** — needs explicit activation to go live (public hostedChat webhook).
- `[Quote] Analyze Roof v1.0.0` (prod `SpUoB6qcBUZVpdAU`, staging `yYN9GQnpZ32ErQIz`): geocode → satellite image (Google Static Maps) → Claude Vision roof analysis → pitch/waste math + haversine travel-fee calc. Active on both staging and prod (needed active for parent to call it as a tool sub-workflow; has no webhook of its own so isn't independently public).
- New Google Sheet "Apex Roofing Pricing" (`1S5J_lxEGt-raDqCNRxM9icwhaGbiGlvTBOHAptcHpfM`), tab `Quote-Pricing` — full professional-grade pricing model (materials, pitch multiplier, waste/complexity factor, tear-off, permit, feature surcharges, travel zones). All $ values are demo placeholders built from industry convention, not real Apex numbers.
- Confirmed Google Maps Geocoding API + Static Maps API both enabled and working for the `Google Maps API` credential.
- Fixed: seeded Qdrant knowledge base for `demo-roofing` no longer claims Apex "does not quote from satellite imagery" — corrected doc chunk + added a direct knowledge-pair entry describing the new instant-quote capability.
- Both prod workflows have `saveDataSuccessExecution: none` (customer address is PII).

**Deployed 2026-07-02 (ops dashboard redesign Phase 4):**
- `[Admin] Get Onboarding State v1.0.0` (prod `QLnMno5sG7wWbRp9`): GET /caiac/admin/onboarding-state
- `[Admin] Disable Client v1.0.0` (prod `1h0kLNBrUCu2rvCL`): POST /caiac/admin/disable-client
- `[Admin] Rerun Onboarding Step v1.0.0` (prod `WIfESJ3Baya7tFhl`): POST /caiac/admin/rerun-onboarding-step
- `[Admin] Onboarding Chat v1.0.0` (prod `4hLdcY8URF8MJix8`): POST /caiac/admin/onboarding-chat
- `[Admin] Test RAG Query v1.0.0` (prod `KeikQAANLZJrb3dB`): POST /caiac/admin/test-rag-query
- **`caiac-ops-dashboard` PR #6 open** (dev → main): Onboarding tab + CF functions + 8 bug fixes. **Blocked on lint CI** — 12 pre-existing errors across 9 components must be fixed before merge.

**Built/deployed 2026-07-02 (ops dashboard redesign Phases 1–3):**
- `[Admin] Platform Overview v1.0.0` (`YlARqDrakkVnrJ7N`): added `clients[]` array — powers sidebar nav client selector. Deployed.
- `caiac-ops-dashboard/dev`: 5 CF functions + `OnboardingTab.tsx` committed.

**Fixed 2026-07-01 (session 2):**
- `[Onboarding] Get Client State v1.0.0` (`PNQCPQgVIHJqK1Qw`): SQL injection fix on staging — parameterized queries replacing string interpolation; not yet deployed to prod
- Built 5 new staging workflows for Ops Dashboard Redesign (Phase 1): Get Onboarding State, Disable Client, Rerun Onboarding Step, Onboarding Chat (21 nodes/9 tools), Test RAG Query

**Fixed 2026-07-01 (session 1):**
- `[Admin] Get Client Config v1.0.0` (`Q59ciz73LRmPg3CZ`): added inline auth gate (onError: continueRegularOutput + IF node + Respond 401) — was returning 200 empty body on auth failure due to broken Error Trigger → respondToWebhook pattern
- `caiac-ops-dashboard` `functions/api/admin-manage-client-user.ts`: CF function now reads X-Webhook-Secret header for HMAC signing (was always using env.CLIENT_WEBHOOK_SECRET, causing "Invalid request signature" in Full Auth) — **needs CF Pages deploy to take effect**

**Fixed in prod (n8n) 2026-06-30 (no redeploy needed):**
- `[Admin] Get AI Usage v1.0.0` (`LxGok5ylNsQg68Vk`): `responseMode` changed `lastNode` → `responseNode` (was causing 500 "Unused Respond to Webhook node")
- `[Admin] Get Quick Action Usage v1.0.0` (`CULnYWmROYMi4IJD`): same fix

**Deployed 2026-06-30 via CF Pages PRs (ops-dashboard #4 + #5):**
- Removed double `/webhook/` prefix from all 11 admin CF functions + `client-ai-usage.ts`
- Corrected `admin-update-client-config.ts` → `/caiac/admin/client-config`
- Corrected `admin-toggle-feature.ts` → `/caiac/admin/client-feature`

**Previously deployed 2026-06-30:** `[Onboarding] Enable Feature v1.0.0` (prod `ZlpKZ33mNhU3ek24`), `[Onboarding] Set Quick Actions v1.0.0` (prod `AhYVwYN7hi0Tti0y`), `[Client] Public Config v1.0.0` updated (prod `eKe1UmMNCOsLp4vz`) — added `quick_action_templates` prompt enrichment
**Fixed in prod (n8n) 2026-07-01:**
- `Chat v2.6.0` (`kgEgpT7XL7KuKD0z`): added Error Trigger → Parse Error → Is Auth Error? → Respond 401/500 error handler. Expired JWT now returns 401 → frontend shows "Your session has expired" instead of generic "couldn't reach knowledge base" error.
- `[Client] Get Activity Feed v1.0.0` (`gofTB1oknvfi2w6J`): `Check Auth` node was checking `auth.authenticated` (never set); fixed to check `auth.client_id`.
- `caiac-lawfirm-demo` (`c66c625`): fixed double `/webhook/` prefix in `sendChatMessage` — public chat now routes correctly through Public Gateway.

**Also live as of 2026-06-30:** `[Admin] Manage Client User v1.0.0` (prod `ojCUXKjeiAWe2L7t`), `[Client] Get AI Usage v1.0.0` (prod `SqtVWxDsJ4KbAdaQ`)
**Previously deployed (2026-06-29):** `[Admin] Update Feature Config v1.0.0` (`9QBwwqPa0rDP2p5S`), `[Admin] Get Client Errors v1.0.0` (`uMqiM9as9lUz4Yx3`), `[Admin] Get Client Analytics v1.0.0` (`WZ2lN2Q4fkepQ8sp`), `[Admin] Platform Overview v1.0.0` (`YlARqDrakkVnrJ7N`)

---

## Pending Deactivation

| Workflow | Prod ID | Safe when |
|---|---|---|
| `CAIAC RAG - Chat v2.5.0` | `eZv65sCV7njNG49Z` | v2.6.0 stable (a few more days) |
| `CAIAC RAG - Chat v2.4.1` | `Wdn95E6Yr6miEHeO` | Confirm no callers via execution log |
| `[Onboarding] Create Lead Sheet v1.0.0` | `mXtKgZzK7Ppncywr` | Agent no longer calls it |
| `[Onboarding] Create Client Lead Sheet v1.0.0` | `WL6OUEmJ4Z5ZGsr8` | Same |
| `[Utility] Validate Auth v1.0.0` | `25FQf7oSGTBlLXqz` | Confirm zero callers |
| `CAIAC Demo - Lead Capture v1.2.0` | `Z6hV4ALmmPL4IdAr` | Already deactivated — delete from n8n |

---

## Pending DB Migrations (not yet run on prod)

| Migration | Blocked by |
|---|---|
| `DROP COLUMN caiac.leads.crm_type, source_id` | Lead Capture v2.2.0 shipping |
