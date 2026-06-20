# CAIAC Feature Flag System

## Overview

Client features are controlled via the `caiac.client_features` table. Each row represents one feature for one client. Features are loaded fresh on every authenticated request via `[Utility] Full Auth v2.0.0` and served publicly via `[Client] Public Config v1.0.0`.

**Storage:** `caiac.client_features` (PostgreSQL)  
**Toggle endpoint:** `POST /caiac/admin/client-feature` → `[Admin] Toggle Client Feature v1.0.0`  
**Public visibility:** `GET /caiac/public/client-config?slug=X` → returns `features: { chat: true, ... }`  
**Auth response:** Full Auth now returns `features` map — callers check `auth.features.chat` etc.

---

## Feature Registry

| Key | Default | Type | Guards |
|---|---|---|---|
| `chat` | ✅ on | core | CAIAC RAG - Chat v2.5.0 |
| `reviews` | ✅ on | core | [Reviews] Handle Rating Click v1.0.0, [Reviews] Process Completed Lead v1.0.0 |
| `intake` | ✅ on | core | [Intake] CAIAC Lead Capture v2.0.0 |
| `crm_sync` | ❌ off | add-on | [Utility] CRM Create Lead v1.0.0 (self-guarded at entry) |
| `lead_scoring` | ❌ off | add-on | [Utility] Score Lead v1.0.0 (self-guarded; pass `client_id` from callers) |
| `sms` | ❌ off | add-on | not yet built |

**Existing clients** were grandfathered in with all 6 features enabled (`enabled_by = 'migration:grandfather'`).  
**New clients** get core features on, add-ons off (seeded by `[Onboarding] Seed Client Features v1.0.0`).

---

## DB Schema

```sql
CREATE TABLE caiac.client_features (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES caiac.clients(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  enabled_by TEXT DEFAULT 'system',   -- 'system:onboarding', 'migration:grandfather', or staff user_id
  config     JSONB DEFAULT '{}',      -- reserved for future per-feature settings (roles, limits, labels)
  UNIQUE (client_id, feature)
);
```

---

## Toggling a Feature (CAIAC Staff)

```http
POST /caiac/admin/client-feature
Authorization: Bearer <staff-jwt>
x-caiac-timestamp: <unix-ts>
x-caiac-signature: <hmac>

{
  "slug": "acme-plumbing",
  "feature": "crm_sync",
  "enabled": true,
  "note": "upgraded to Pro plan"
}
```

Returns: `{ success, slug, feature, enabled, enabled_at }`

The change is live immediately — the next auth call for that client picks up the updated features.

---

## How Feature Guards Work

### Auth-gated workflows (e.g. Chat)
Full Auth v2.0.0 now returns `features` in its output. After calling Full Auth, add an IF node:

```
Call Full Auth → Check Auth Valid → [Feature Guard IF] → proceed
                                                       ↘ Respond 403
```

IF condition: `$('Call Full Auth').first().json.features?.chat` equals `true`

### Public webhooks (e.g. Intake, Reviews)
These don't use Full Auth. Add a Postgres check node after the client config is fetched:

```sql
SELECT COALESCE(
  (SELECT enabled FROM caiac.client_features WHERE client_id = $1::uuid AND feature = 'intake'),
  false
) AS enabled
```

Then IF `$json.enabled` equals `true` → proceed, else Respond 403.

For slug-based lookups (Reviews pattern):
```sql
SELECT COALESCE(
  (SELECT cf.enabled FROM caiac.client_features cf
   JOIN caiac.clients c ON cf.client_id = c.id
   WHERE c.slug = $1 AND cf.feature = 'reviews'),
  false
) AS enabled
```

---

## Adding a New Feature — Checklist for Claude

When adding a new feature to the CAIAC platform, follow these steps:

### 1. Add to the registry table above
Update the Feature Registry table in this document with:
- Key (snake_case)
- Default (on/off)
- Type (core / add-on)
- Which workflow(s) it guards

### 2. Update `[Admin] Toggle Client Feature v1.0.0`
In the `Validate Request` code node, add the new key to `KNOWN_FEATURES`:
```js
const KNOWN_FEATURES = ['chat', 'reviews', 'intake', 'crm_sync', 'lead_scoring', 'sms', 'your_new_feature'];
```

### 3. Update `[Onboarding] Seed Client Features v1.0.0`
Add a new VALUES row to the INSERT in the `Seed Default Features` Postgres node:
```sql
($1::uuid, 'your_new_feature', false, 'system:onboarding'),  -- or true if core
```

### 4. Run a migration for existing clients
Use a temp webhook workflow to backfill existing clients:
```sql
INSERT INTO caiac.client_features (client_id, feature, enabled, enabled_by)
SELECT id, 'your_new_feature', false, 'migration:backfill'  -- or true to grandfather
FROM caiac.clients WHERE active = true
ON CONFLICT (client_id, feature) DO NOTHING;
```

### 5. Add a feature guard to the new workflow
Follow the guard pattern above based on whether the workflow is auth-gated or public.

### 6. Update `[Client] Public Config v1.0.0` if needed
The endpoint already returns all features from the table — no change needed unless you want to hide a feature from the public response.

---

## Onboarding Agent Integration

The `[Onboarding] CAIAC Client Agent v1.0.0` has a `seed_features` tool that calls `[Onboarding] Seed Client Features v1.0.0`. The agent is instructed to call this **immediately after `create_client` succeeds**, passing the returned `client_id`.

**Tool description (for agent):**
> Seeds default feature flags for a newly created client. Always call this immediately after create_client succeeds, passing the returned client_id. Sets chat, reviews, intake ON by default; crm_sync, lead_scoring, sms OFF by default.

When onboarding a client on a specific plan, you can manually toggle add-on features on after onboarding completes using the Toggle endpoint above.

---

## Future: Role-Based Feature Visibility

The `config JSONB` column in `client_features` is reserved for Layer 2 — client admin control of which roles can see enabled features:

```json
{
  "visible_to_roles": ["admin"],
  "label": "CRM Sync",
  "icon": "refresh"
}
```

When this is implemented:
- An auth'd `/client/features` endpoint returns the role-filtered feature list
- The public endpoint continues to return the Layer 1 enabled/disabled map only
- No DB migration needed — the `config` column is already there
