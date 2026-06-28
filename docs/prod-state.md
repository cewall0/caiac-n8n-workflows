# Production State

> Auto-maintained by `/deploy`, `/fix-now`, and `/session-end` skills.
> Do not edit manually — run `/session-end` to reconcile after any session that touches prod.

**Last updated:** 2026-06-28

---

## Known Prod Bugs

_None._

---

## On Prod — Inactive (needs activation)

| Workflow | Prod ID | Notes |
|---|---|---|
| `[Admin] Get AI Usage v1.0.0` | `LxGok5ylNsQg68Vk` | Deployed 2026-06-28 — activate to enable ops dashboard AI usage panel |
| `[Admin] Get Quick Action Usage v1.0.0` | `CULnYWmROYMi4IJD` | Deployed 2026-06-28 — activate to enable ops dashboard quick action panel |
| `[Utility] Log AI Usage v1.0.0` | `qfF38DCuWIXhxsY9` | Deployed 2026-06-28 — sub-workflow, activate when a caller wires it in |

---

## Staged But Not On Prod

| Workflow | Staging ID | Blocked by |
|---|---|---|
| `[Onboarding] Enable Feature v1.0.0` | `9BxuTHAipJJXvM45` | Phase 2 deploy |
| `[Onboarding] Set Quick Actions v1.0.0` | `AzMs6ZLtEPm5pBf3` | Phase 2 deploy |
| `[Client] Public Config v1.0.0` (with quick_actions join) | prod `eKe1UmMNCOsLp4vz` has old version | Frontend quick_actions PRs |
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | **Stays staging-only** (dev tool) |
| `[Reviews] Handle Rating Click v1.0.0` | No staging version exists | Build staging version first |
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
| `ADD COLUMN caiac.clients.facebook_review_link TEXT` | Phase 0 admin-sprint |
| `RENAME COLUMN client_admin_email → review_notify_email` | Handle Rating Click staging deploy first |
| Remove `sheet_id` from `clients.config` | Phase 0 admin-sprint |
