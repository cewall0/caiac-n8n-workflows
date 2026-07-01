# Roles & Features — Platform Access Control Reference

Two systems control what users can do and see on the CAIAC platform:

1. **Roles** — who the user is; controls which documents they can retrieve in chat
2. **Features** — what a client account has enabled; controls which product capabilities are active

They connect at Layer 2 (not yet built): the `config` column in `client_features` is reserved for role-based feature visibility (e.g. only `admin` users can see the CRM sync feature in the dashboard).

---

## Part 1: User Roles

### Role Definitions

| Role | Who it is |
|---|---|
| `owner` | Business owner — full access |
| `admin` | Manager-level staff — most access |
| `staff` | General staff — standard access |
| `client` | End client/customer — public content only, chat-only view |
| `guest` | Unauthenticated or provisional — public content only |

Roles are stored in `caiac.users.role` and stamped into the JWT at sign-in. They are not editable by clients.

### Document Roles

Every document ingested into the RAG system is stamped with a role. Valid values:

| Document role | Who can retrieve it |
|---|---|
| `public` | Everyone (all roles) |
| `staff` | staff, admin, owner |
| `admin` | admin, owner |
| `owner` | owner only |

Invalid document roles (e.g. `"Public"` with a capital P) are rejected at ingest time with a clear error.

### Role Hierarchy Table

**Table:** `caiac.role_hierarchy`

| role | visible_roles |
|---|---|
| `owner` | public, staff, admin, owner |
| `admin` | public, staff, admin |
| `staff` | public, staff |
| `client` | public |
| `guest` | public |

To change the hierarchy without touching any workflow, run a SQL UPDATE:
```sql
UPDATE caiac.role_hierarchy
SET visible_roles = ARRAY['public', 'staff', 'admin', 'owner']
WHERE role = 'admin';
```

### How Document Visibility Works (End to End)

1. Document is ingested with a `role` field (e.g. `"staff"`) stamped on every Qdrant chunk
2. User signs in — their role (e.g. `"admin"`) is stored in `caiac.sessions`
3. Chat request arrives — `Get Role Permissions` queries `caiac.role_hierarchy` for the user's role → returns `['public', 'staff', 'admin']`
4. Qdrant search filters to chunks where `role` is in `allowed_roles`
5. A `staff` user sees public + staff documents. An `admin` also sees admin documents. A `guest` sees only public.

**Workflow chain (chat auth section):**
```
Check Token Valid → Get Role Permissions → Get Client Config → Validate Request
```

---

## Part 2: Client Features

### What Features Are

Features are per-client capability flags. One row per client per feature in `caiac.client_features`. Checked on every authenticated request via Full Auth v2.0.0 and served publicly via the client config endpoint.

**Toggle endpoint:** `POST /caiac/admin/client-feature` → `[Admin] Toggle Client Feature v1.0.0`
**Public read:** `GET /caiac/public/client-config?slug=X` → returns `{ features: { chat: true, ... } }`
**Auth response:** Full Auth returns a `features` map — callers check `auth.features.chat` etc.

### Feature Registry

| Key | Default | Type | Guarded in |
|---|---|---|---|
| `chat` | ✅ on | core | CAIAC RAG - Chat v2.5.0 |
| `reviews` | ✅ on | core | [Reviews] Handle Rating Click, [Reviews] Process Completed Lead |
| `intake` | ✅ on | core | [Intake] CAIAC Lead Capture v2.0.0 |
| `crm_sync` | ❌ off | add-on | [Utility] CRM Create Lead v1.0.0 |
| `lead_scoring` | ❌ off | add-on | [Utility] Score Lead v1.0.0 |
| `sms` | ❌ off | add-on | not yet built |

**New clients:** core features on, add-ons off (seeded by `[Onboarding] Seed Client Features v1.0.0`)
**Existing clients (pre-2026-06):** grandfathered in with all features enabled

### DB Schema

```sql
CREATE TABLE caiac.client_features (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES caiac.clients(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  enabled_by TEXT DEFAULT 'system',  -- 'system:onboarding', 'migration:grandfather', or staff user_id
  config     JSONB DEFAULT '{}',     -- reserved: Layer 2 role-based visibility
  UNIQUE (client_id, feature)
);
```

### Toggling a Feature (CAIAC Staff)

```http
POST /caiac/admin/client-feature
Authorization: Bearer <staff-jwt>
x-caiac-timestamp: <unix-ts>
x-caiac-signature: <hmac>

{ "slug": "acme-plumbing", "feature": "crm_sync", "enabled": true, "note": "upgraded to Pro" }
```

Change is live immediately — the next auth call picks up the updated features.

### Feature Guards

**Auth-gated workflows (e.g. Chat):**
Full Auth v2.0.0 returns `features` in its output. After calling Full Auth, add an IF node:
```
Call Full Auth → Check Auth Valid → [Feature Guard IF] → proceed
                                                       ↘ Respond 403
```
IF condition: `$('Call Full Auth').first().json.features?.chat` equals `true`

**Public webhooks (e.g. Intake, Reviews) — UUID-based:**
```sql
SELECT COALESCE(
  (SELECT enabled FROM caiac.client_features WHERE client_id = $1::uuid AND feature = 'intake'),
  false
) AS enabled
```
Then IF `$json.enabled` equals `true` → proceed, else Respond 403.

**Public webhooks — slug-based:**
```sql
SELECT COALESCE(
  (SELECT cf.enabled FROM caiac.client_features cf
   JOIN caiac.clients c ON cf.client_id = c.id
   WHERE c.slug = $1 AND cf.feature = 'reviews'),
  false
) AS enabled
```

---

## Adding a New Feature — Checklist

Every new billable feature must touch all five of these. Missing any one breaks the system.

**1. Add to the Feature Registry table above** — key, default, type, which workflow guards it.

**2. Update `[Admin] Toggle Client Feature v1.0.0`**
In the `Validate Request` code node, add the key to `KNOWN_FEATURES`:
```js
const KNOWN_FEATURES = ['chat', 'reviews', 'intake', 'crm_sync', 'lead_scoring', 'sms', 'your_new_feature'];
```

**3. Update `[Onboarding] Seed Client Features v1.0.0`**
Add a VALUES row to the `Seed Default Features` Postgres node:
```sql
($1::uuid, 'your_new_feature', false, 'system:onboarding'),  -- or true if core
```

**4. Backfill existing clients**
Run a temp webhook workflow:
```sql
INSERT INTO caiac.client_features (client_id, feature, enabled, enabled_by)
SELECT id, 'your_new_feature', false, 'migration:backfill'
FROM caiac.clients WHERE active = true
ON CONFLICT (client_id, feature) DO NOTHING;
```

**5. Add a feature guard to the new workflow** — use the guard patterns above.

---

## Layer 2 — Role-Based Feature Visibility (Not Yet Built)

The `config JSONB` column in `client_features` is reserved for this. When built:
- An auth'd `/client/features` endpoint returns the role-filtered feature list
- The public endpoint continues to return the plain enabled/disabled map
- No DB migration needed — the `config` column is already there

Example future shape:
```json
{ "visible_to_roles": ["admin"], "label": "CRM Sync", "icon": "refresh" }
```
