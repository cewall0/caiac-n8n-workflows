# Production State

> Auto-maintained by `/deploy`, `/fix-now`, and `/session-end` skills.
> Do not edit manually — run `/session-end` to reconcile after any session that touches prod.

**Last updated:** 2026-06-30

---

## Known Prod Bugs

None.

---


## Staged But Not On Prod

### n8n Workflows

| Workflow | Staging ID | Blocked by |
|---|---|---|
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | **Stays staging-only** (dev tool) |
| `[Utility] CRM Create Lead v1.0.0` (new interface) | `YbGsqynXbfoWgxec` | Test with lead that has non-null `intake_data` |

**Fixed in prod (n8n) 2026-06-30 (no redeploy needed):**
- `[Admin] Get AI Usage v1.0.0` (`LxGok5ylNsQg68Vk`): `responseMode` changed `lastNode` → `responseNode` (was causing 500 "Unused Respond to Webhook node")
- `[Admin] Get Quick Action Usage v1.0.0` (`CULnYWmROYMi4IJD`): same fix

**Deployed 2026-06-30 via CF Pages PRs (ops-dashboard #4 + #5):**
- Removed double `/webhook/` prefix from all 11 admin CF functions + `client-ai-usage.ts`
- Corrected `admin-update-client-config.ts` → `/caiac/admin/client-config`
- Corrected `admin-toggle-feature.ts` → `/caiac/admin/client-feature`

**Previously deployed 2026-06-30:** `[Onboarding] Enable Feature v1.0.0` (prod `ZlpKZ33mNhU3ek24`), `[Onboarding] Set Quick Actions v1.0.0` (prod `AhYVwYN7hi0Tti0y`), `[Client] Public Config v1.0.0` updated (prod `eKe1UmMNCOsLp4vz`) — added `quick_action_templates` prompt enrichment
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
