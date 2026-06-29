# Production State

> Auto-maintained by `/deploy`, `/fix-now`, and `/session-end` skills.
> Do not edit manually — run `/session-end` to reconcile after any session that touches prod.

**Last updated:** 2026-06-28

---

## Known Prod Bugs

None.

---


## Staged But Not On Prod

| Workflow | Staging ID | Blocked by |
|---|---|---|
| `[Onboarding] Enable Feature v1.0.0` | `9BxuTHAipJJXvM45` | Phase 2 deploy |
| `[Onboarding] Set Quick Actions v1.0.0` | `AzMs6ZLtEPm5pBf3` | Phase 2 deploy |
| `[Client] Public Config v1.0.0` (with quick_actions join) | prod `eKe1UmMNCOsLp4vz` has old version | Frontend quick_actions PRs |
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | **Stays staging-only** (dev tool) |
| `[Admin] Update Client Config v1.0.0` (sheet_id removal) | prod `b8StToReJzg1bzKp` has old version | Migration 3 (remove sheet_id from clients.config JSONB) |
| `[Admin] Manage Client User v1.0.0` | `uzaI96FM0mgcS4He` | Needs ops-dashboard CF deploy + manual test of cross-client isolation on prod before activating |
| `[Client] Get AI Usage v1.0.0` | `uLKo4AfS1sU7i9aP` | Needs client-dashboard CF deploy (Phase 4) |
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
| ~~`RENAME COLUMN client_admin_email → review_notify_email`~~ | ✅ Done 2026-06-29 — Handle Rating Click + Setup Client Sheet updated on prod |
| Remove `sheet_id` from `clients.config` | Phase 0 admin-sprint |
