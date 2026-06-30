# Production State

> Auto-maintained by `/deploy`, `/fix-now`, and `/session-end` skills.
> Do not edit manually — run `/session-end` to reconcile after any session that touches prod.

**Last updated:** 2026-06-29

---

## Known Prod Bugs

None.

---


## Staged But Not On Prod

### n8n Workflows

| Workflow | Staging ID | Blocked by |
|---|---|---|
| `[Onboarding] Enable Feature v1.0.0` | `9BxuTHAipJJXvM45` | Admin sprint Phase 2 full deploy |
| `[Onboarding] Set Quick Actions v1.0.0` | `AzMs6ZLtEPm5pBf3` | Admin sprint Phase 2 full deploy |
| `[Client] Public Config v1.0.0` (with quick_actions join) | prod `eKe1UmMNCOsLp4vz` has old version | Frontend quick_actions PRs (caiac-client-dashboard PR #1) |
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | **Stays staging-only** (dev tool) |
| `[Admin] Update Feature Config v1.0.0` | `0umq3oRX4zqCh60f` | Admin sprint Phase 2 full deploy |
| `[Admin] Get Client Errors v1.0.0` | `hsRbHjUFvQAUVXau` | Admin sprint Phase 2 full deploy |
| `[Admin] Get Client Analytics v1.0.0` | `okXdefXDq3HXrGzx` | Admin sprint Phase 2 full deploy |
| `[Admin] Platform Overview v1.0.0` | `V5xv5ni6mBcb3tGf` | Admin sprint Phase 2 full deploy |
| `[Admin] Manage Client User v1.0.0` | `uzaI96FM0mgcS4He` | Needs ops-dashboard CF deploy + manual cross-client isolation test on prod |
| `[Client] Get AI Usage v1.0.0` | `uLKo4AfS1sU7i9aP` | Needs client-dashboard CF deploy |
| `[Utility] CRM Create Lead v1.0.0` (new interface) | `YbGsqynXbfoWgxec` | Test with lead that has non-null `intake_data` |

### Staged CF Functions (not yet on prod — require Cloudflare Pages deploy)

**caiac-ops-dashboard `functions/api/`:**
- `admin-toggle-feature.ts` — POST /admin/client-feature (used by Phase 3 Step 17 panel)
- `admin-update-feature-config.ts` — POST /admin/update-feature-config
- `admin-manage-client-user.ts` — POST /admin/manage-client-user
- `admin-client-errors.ts` — GET /admin/client-errors
- `admin-client-analytics.ts` — GET /admin/client-analytics
- `admin-platform-overview.ts` — GET /admin/platform-overview
- `admin-client-platform-config.ts` — GET + POST /admin/client-platform-config
- `admin-client-config.ts` — GET /admin/client-config

**caiac-client-dashboard `functions/api/`:**
- `client-ai-usage.ts` — GET /client/ai-usage

### Staged Ops Dashboard Components (on `dev` branch, not yet deployed to Cloudflare)

- `ClientConfigPanel.tsx` + `FeatureToggles.tsx` + `admin-toggle-feature.ts` — Phase 3 Step 17. Panel shell with 8-tab layout, Features tab with optimistic toggles + dependency guard. Deployed to `dev` 2026-06-29.

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
