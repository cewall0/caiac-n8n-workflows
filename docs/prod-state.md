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
| `[Reviews] Handle Rating Click v1.0.0` | `BWMWB1CLkJxUi3TU` | Blocked by migration 2 (`RENAME COLUMN client_admin_email → review_notify_email`). Also fixes the Reviews Feature routing bug. Deploy together with prod Handle Rating Click update + Setup Client Sheet update. |
| `[Utility] CRM Create Lead v1.0.0` (new interface) | Staging `YbGsqynXbfoWgxec` | Test with a lead that has non-null `intake_data`; lower priority than admin sprint |

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
