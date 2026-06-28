# Production State

> Auto-maintained by `/deploy`, `/fix-now`, and `/session-end` skills.
> Do not edit manually — run `/session-end` to reconcile after any session that touches prod.

**Last updated:** 2026-06-28

---

## Known Prod Bugs

| Workflow | Prod ID | Bug | Priority |
|---|---|---|---|
| `[Reviews] Handle Rating Click v1.0.0` | `XSQemRjTkLP0D15x` | `Reviews Feature Enabled?` IF node routes BOTH true+false outputs to true branch — reviews-disabled path returns no response (hangs). Fixed in staging version. Deploy with migration 2. | Low (henderson has reviews enabled; disabled path never hit) |

---


## Staged But Not On Prod

| Workflow | Staging ID | Blocked by |
|---|---|---|
| `[Onboarding] Enable Feature v1.0.0` | `9BxuTHAipJJXvM45` | Phase 2 deploy |
| `[Onboarding] Set Quick Actions v1.0.0` | `AzMs6ZLtEPm5pBf3` | Phase 2 deploy |
| `[Client] Public Config v1.0.0` (with quick_actions join) | prod `eKe1UmMNCOsLp4vz` has old version | Frontend quick_actions PRs |
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | **Stays staging-only** (dev tool) |
| `[Reviews] Handle Rating Click v1.0.0` | `BWMWB1CLkJxUi3TU` | Blocked by migration 2 (`RENAME COLUMN client_admin_email → review_notify_email`). Also fixes the Reviews Feature routing bug. Deploy together with prod Handle Rating Click + Setup Client Sheet updates. |
| `[Utility] Get Client Review Config v1.0.0` | `B8sWg1roOIW1tNMo` | Deploy with Handle Rating Click (staging sub-workflow) |
| `[Utility] Sign Review Token v1.0.0` | `Hl6Fm8CnL4CTcuvO` | Deploy with Handle Rating Click |
| `[Utility] Update Lead Sheet Row v1.0.0` | `D9uB0nyZ0M5vmtcu` | Deploy with Handle Rating Click |
| `[Utility] Record Rating v1.0.0` | `MbuXdlJknTSUWgQ9` | Deploy with Handle Rating Click |
| `[Onboarding] Setup Client Sheet v1.0.0` (review_notify_email update) | prod `qS8R4WROB0zrJppB` has old version | Deploy with Handle Rating Click + run migration 2 |
| `[Admin] Update Client Config v1.0.0` (sheet_id removal) | prod `b8StToReJzg1bzKp` has old version | Migration 3 (remove sheet_id from clients.config JSONB) |
| `[Admin] Update Feature Config v1.0.0` | `0umq3oRX4zqCh60f` | Admin sprint Phase 2 — ready to deploy |
| `[Admin] Get Client Errors v1.0.0` | `hsRbHjUFvQAUVXau` | Admin sprint Phase 2 — ready to deploy |
| `[Admin] Platform Overview v1.0.0` | `V5xv5ni6mBcb3tGf` | Admin sprint Phase 2 — ready to deploy |
| `[Admin] Manage Client User v1.0.0` | `uzaI96FM0mgcS4He` | Admin sprint Phase 2 — needs security test first (cross-client isolation) |
| `[Admin] Get Client Analytics v1.0.0` | `okXdefXDq3HXrGzx` | Admin sprint Phase 2 — ready to deploy |
| `[Client] Get AI Usage v1.0.0` | `uLKo4AfS1sU7i9aP` | Admin sprint Phase 4 — needs security test first (no slug override) |
| `[Utility] CRM Create Lead v1.0.0` (new interface) | `YbGsqynXbfoWgxec` | Test with a lead that has non-null `intake_data`; lower priority than admin sprint |

### Staged CF Functions (not yet on prod — require Cloudflare Pages deploy)

**caiac-ops-dashboard `functions/api/`:**
- `admin-update-feature-config.ts` — POST /admin/update-feature-config
- `admin-manage-client-user.ts` — POST /admin/manage-client-user
- `admin-client-errors.ts` — GET /admin/client-errors
- `admin-client-analytics.ts` — GET /admin/client-analytics
- `admin-platform-overview.ts` — GET /admin/platform-overview
- `admin-client-platform-config.ts` — GET + POST /admin/client-platform-config *(blocked by migration 2 on n8n side)*
- `admin-client-config.ts` — GET /admin/client-config *(blocked by migration 2 — n8n workflow not built yet)*

**caiac-client-dashboard `functions/api/`:**
- `client-ai-usage.ts` — GET /client/ai-usage

### Still To Build (blocked by migration 2)

- `[Admin] Get Client Config v1.0.0` — build AFTER migration 2 runs (reads `review_notify_email`)
- `[Admin] Get/Update Client Platform Config v1.0.0` — same

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

## Pending Frontend PRs

| Repo | Change | Status |
|---|---|---|
| `caiac-client-dashboard` | Send `quick_action_key` in chat POST payload | PR #1 open (dev → main) |
| `caiac-ops-dashboard` | Quick action usage table, Claude usage + cap display, edit quick_actions + cap | PR #1 open (dev → main) |

---

## Pending DB Migrations (not yet run on prod)

| Migration | Blocked by |
|---|---|
| `DROP COLUMN caiac.leads.crm_type, source_id` | Lead Capture v2.2.0 shipping |
| `RENAME COLUMN client_admin_email → review_notify_email` on `client_platform_config` | Staging workflows ready. Must update prod Handle Rating Click + Setup Client Sheet to use `review_notify_email`, then deploy both, then run SQL off-hours within same minute. |
| Remove `sheet_id` from `clients.config` | Phase 0 admin-sprint |
