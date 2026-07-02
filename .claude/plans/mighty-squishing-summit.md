# Mighty Squishing Summit — Ops Dashboard Redesign Sprint

**Status: COMPLETE — PR #6 merged 2026-07-02 (squash commit `61e68f1`), CF Pages deployed**
**Repos touched:** `caiac-n8n-workflows`, `caiac-ops-dashboard`, `caiac-client-dashboard`
**Started:** 2026-06-28
**Source plans absorbed:**
- [`.claude/plans/archive/admin-client-config-panel.md`](archive/admin-client-config-panel.md) — Phases 0–4 complete through step 24; step 16 (onboarding tab) is now this plan
- [`.claude/plans/onboarding-tab.md`](onboarding-tab.md) — SUPERSEDED; all work folded into Phase 4 below

---

## What This Sprint Delivered

A complete ops dashboard overhaul covering:
1. **8 admin panel tabs** — Overview, Features, AI, Config, Reviews, Users, Analytics, Onboarding
2. **13 n8n admin workflows** on prod
3. **12 Cloudflare Functions** in `caiac-ops-dashboard/functions/api/`
4. **Client dashboard** — AI usage bar + footer copy
5. **DB migrations** — `facebook_review_link` column, `client_admin_email` rename, `sheet_id` cleanup

---

## Phase Status

### Phase 0 — DB Cleanup ✅
| # | Task | Status |
|---|---|---|
| 1 | Add `facebook_review_link` column | ✅ 2026-06-28 |
| 2 | Update `Handle Rating Click` → `review_notify_email` | ✅ prod |
| 3 | Update `Setup Client Sheet` upsert SQL | ✅ prod |
| 4 | Rename `client_admin_email` → `review_notify_email` | ✅ 2026-06-29 |
| 5 | Update `[Admin] Update Client Config` — JOIN `client_platform_config` | ✅ prod `b8StToReJzg1bzKp` |
| 6 | Remove `sheet_id` from `clients.config` | ✅ 2026-06-29 |

### Phase 1 — Critical Fixes ✅
| # | Task | Prod ID |
|---|---|---|
| 7 | Fix Chat v2.6.0 `Get Claude Cap` node — reads `config` not hardcoded 100 | `kgEgpT7XL7KuKD0z` |
| 7a | Fix `[Admin] Get AI Usage` — `config` not `metadata`, parameterized slug | `LxGok5ylNsQg68Vk` |
| 7b | Update `tests/workflows/chat-v26.test.ts` — cap enforcement tests | ✅ |

### Phase T — Test Infrastructure ✅ (partial — T10/T11 need cewall0)
| # | Task | Status |
|---|---|---|
| T1-T5 | Playwright config, both dashboard projects wired | ✅ |
| T6 | `.env.test.example` additions (`OPS_DASHBOARD_URL`, etc.) | ✅ |
| T7 | `tests/helpers/sign.ts` — `signReviewLink()` + `expiredReviewLink()` | ✅ |
| T8 | `tests/fixtures/analytics.ts` — seed/clean analytics data | ✅ |
| T9 | `tests/global-setup.ts` — global teardown deletes `test-%` rows | ✅ |
| T10 | Add nightly cleanup node for test rows (Nightly Cleanup workflow) | ⏳ cewall0 |
| T11 | Seed dedicated test-only client in staging DB | ⏳ cewall0 |

### Phase 2 — New n8n Workflows ✅
All deployed to prod and active.

| Workflow | Prod ID | Test file |
|---|---|---|
| `[Admin] Get Client Config v1.0.0` | `Q59ciz73LRmPg3CZ` | `admin-client-config.test.ts` ✅ |
| `[Admin] Update Feature Config v1.0.0` | `9QBwwqPa0rDP2p5S` | `admin-update-feature-config.test.ts` ✅ |
| `[Admin] Get Client Errors v1.0.0` | `uMqiM9as9lUz4Yx3` | `admin-client-errors.test.ts` ✅ |
| `[Admin] Get/Update Client Platform Config v1.0.0` | `7bECMgCmgR5JY2X3` | `admin-client-platform-config.test.ts` ✅ |
| `[Admin] Manage Client User v1.0.0` | `ojCUXKjeiAWe2L7t` | `admin-manage-client-user.test.ts` ✅ |
| `[Admin] Get Client Analytics v1.0.0` | `WZ2lN2Q4fkepQ8sp` | `admin-client-analytics.test.ts` ✅ |
| `[Admin] Platform Overview v1.0.0` | `YlARqDrakkVnrJ7N` | `admin-platform-overview.test.ts` ✅ |
| `[Client] Get AI Usage v1.0.0` | `SqtVWxDsJ4KbAdaQ` | `client-ai-usage.test.ts` ✅ |

### Phase 3 — Ops Dashboard Tabs ✅
All tabs built, TypeScript clean, E2E specs in `tests/e2e/ops-dashboard/`.

| # | Component | Tab | Spec |
|---|---|---|---|
| 17 | `FeatureToggles.tsx` | Features | `panel-features.spec.ts` |
| 18 | `AIProviderConfig.tsx` | AI | `panel-ai.spec.ts` |
| 19 | `ConfigTab.tsx` | Config | `panel-config.spec.ts` |
| 20 | `ReviewsTab.tsx` | Reviews | `panel-reviews.spec.ts` |
| 21 | `UsersTab.tsx` | Users | `panel-users.spec.ts` |
| 22 | `OverviewTab.tsx` | Overview | `panel-overview.spec.ts` |
| 23 | `AnalyticsTab.tsx` | Analytics | `panel-analytics.spec.ts` |
| 24 | `PlatformOverviewBar.tsx` + `FeatureAdoptionHeatmap.tsx` | Main dashboard | `platform.spec.ts` |

### Phase 4 — Client Dashboard ✅
| # | Task | Status |
|---|---|---|
| 25 | `AIUsageBar.tsx` — renders when `advanced_ai` on, progress bar, resets date | ✅ |
| 26 | Footer copy fix in `ChatView.tsx` — cloud_consent-aware | ✅ |

### Phase 4 (extended) — Onboarding Tab + Deploy ✅
*Absorbed from [onboarding-tab.md](onboarding-tab.md). Added Disable Client and Test RAG Query beyond the original 3 workflows.*

All 5 n8n workflows deployed to prod and active (2026-07-02):

| Workflow | Prod ID | Endpoint |
|---|---|---|
| `[Admin] Get Onboarding State v1.0.0` | `QLnMno5sG7wWbRp9` | `GET /caiac/admin/onboarding-state` |
| `[Admin] Disable Client v1.0.0` | `1h0kLNBrUCu2rvCL` | `POST /caiac/admin/disable-client` |
| `[Admin] Rerun Onboarding Step v1.0.0` | `WIfESJ3Baya7tFhl` | `POST /caiac/admin/rerun-onboarding-step` |
| `[Admin] Onboarding Chat v1.0.0` | `4hLdcY8URF8MJix8` | `POST /caiac/admin/onboarding-chat` |
| `[Admin] Test RAG Query v1.0.0` | `KeikQAANLZJrb3dB` | `POST /caiac/admin/test-rag-query` |

CF Functions in `caiac-ops-dashboard/functions/api/`:
- `admin-onboarding-state.ts` ✅
- `admin-onboarding-chat.ts` ✅
- `admin-rerun-onboarding-step.ts` ✅
- `admin-disable-client.ts` ✅
- `admin-test-rag-query.ts` ✅

Frontend:
- `src/components/OnboardingTab.tsx` ✅ — two sections (new client chat + current client provisioning state)
- 8 bugs found in code review (2026-07-02) and fixed:
  - `d.response` not `d.output` in sendChat
  - Response shape mapping (`steps[]` → `steps_completed{}`, `features{}` → `enabled_features[]`)
  - `{slug, confirm: slug}` in disableClient body
  - Error surfaced to UI in disableClient
  - `res.ok` check in sendChat before parsing
  - `setup_sheet canRerun: false` (not in n8n ALLOWED list)
  - `send_welcome_email` removed from EXTRA_ACTIONS (no endpoint)
  - `/caiac/` prefix added to `admin-manage-client-user.ts`

**PR #6 merged 2026-07-02** (squash commit `61e68f1` on `main`). Lint fixed in `893d7ac`. CI green, CF Pages deployed automatically.

### Phase 5 — Lint CI Fix + Merge ✅ DONE (2026-07-02)

---

## n8n Rerun ALLOWED Steps

The `[Admin] Rerun Onboarding Step v1.0.0` workflow accepts only these step keys:
```
'seed_features' | 'stub_crm_config' | 'smoke_test'
```

`create_client` and `create_user` are blocked (return 400). `setup_sheet` and `send_welcome_email` are **not** in the allowed list — they require a separate dedicated endpoint or n8n workflow addition before the UI can expose them.

---

## Onboarding Chat Response Shape

`[Admin] Onboarding Chat v1.0.0` returns:
```json
{ "response": "<agent text>", "session_id": "<staffUserId>:<targetSlug>" }
```
Field is `response`, **not** `output`. Frontend reads `d.response`.

---

## Get Onboarding State Response Shape

`[Admin] Get Onboarding State v1.0.0` returns:
```json
{
  "slug": "henderson-hvac",
  "exists": true,
  "client_id": "uuid",
  "client_name": "Henderson HVAC",
  "steps": [
    { "key": "create_client", "label": "Create client record", "status": "done" },
    { "key": "create_user", "label": "Create user account", "status": "done" },
    { "key": "setup_sheet", "label": "Setup lead sheet", "status": "not_run" },
    { "key": "stub_crm_config", "label": "Stub CRM config", "status": "done" },
    { "key": "seed_features", "label": "Seed feature flags", "status": "done" }
  ],
  "features": { "chat": true, "intake": false, "reviews": false }
}
```

Status values: `"done"` | `"not_run"`. Features is a `Record<string, boolean>`.

Frontend maps: `steps_completed[key] = step.status === "done"`, `enabled_features = Object.entries(features).filter(([,v]) => v).map(([k]) => k)`.

---

## Open Items (post-sprint)

- [ ] **Tally form helper** — `TallySetupModal.tsx` + `admin-tally-test-lead.ts` CF function — deferred from original plan; not yet built
- [ ] **`[Admin] Offboard Client v1.0.0`** — Danger Zone "Disable client" button live, but offboard workflow not built; currently only sets `active = false` via Disable Client workflow
- [ ] **Onboarding tab tests** — `admin-onboarding-state.test.ts`, `admin-onboarding-chat.test.ts`, `admin-rerun-onboarding-step.test.ts` not yet written
- [ ] **T10/T11** — nightly cleanup node for test rows + dedicated staging test client (cewall0)
