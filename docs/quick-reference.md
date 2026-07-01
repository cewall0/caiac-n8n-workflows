# Quick Reference

> Cheat sheet for things Claude looks up repeatedly. Auto-extended whenever a new credential, ID, or pattern gets used.

---

## Credential Names (must match exactly between staging and prod)

| Credential name | Type | Used by |
|---|---|---|
| `CAIAC Postgres` | Postgres | All DB nodes. Staging credential ID: `oJ321kQrsEmHydiQ` |
| `Caiac Group Sheets` | Google Sheets OAuth2 | All Sheets + Drive nodes. Prod credential ID: `aZpl46gLl1Uha2wW` |
| `Anthropic API` | `anthropicApi` | Chat v2.6.0 (Claude calls) |
| `Telnyx API` | `httpBearerAuth` | Send SMS v1.0.0 |
| `SendGrid` | SendGrid | Send Email v1.0.0 |

> If a credential name doesn't exist on staging but does on prod (or vice versa), the workflow JSON won't transfer cleanly. Flag mismatches before any prod deploy.

---

## Key Workflow IDs

### Frequently called sub-workflows (staging → prod)

| Workflow | Staging ID | Prod ID |
|---|---|---|
| `[Utility] Full Auth v2.0.0` | — | `XWbmBI9NYdwK80eg` |
| `[Utility] Handle Workflow Error v1.0.0` | `BKjnZ73xtJ0LAMvH` | `hZk1sE4UP2Vmn5QV` |
| `[Utility] Send Email v1.0.0` | `3EqT2kq1Qc9bKLkb` | `tdI7VopcP5vpet6J` |
| `[Utility] Send SMS v1.0.0` | `qzycMgk9pK0lOpdt` | `5GxBQucu4Wr62JV8` |
| `[Utility] Score Lead v1.0.0` | `TgIGx96aDK3T0m80` | `6lzuSE2b7txCLWm2` |
| `[Admin] Get DB Schema v1.0.0` | `6RE9D1dQYKeus9a0` | staging-only |

### Active prod entry points (webhooks)

| Path | Workflow | Prod ID |
|---|---|---|
| `/caiac/chat` | Chat v2.6.0 | `kgEgpT7XL7KuKD0z` |
| `/webhook/public/chat` | Public Gateway v1.0.0 | `GQx5Rx8sGGTQIeqi` |
| `/caiac/activity-feed` | Get Activity Feed v1.0.0 | `gofTB1oknvfi2w6J` |
| `/caiac/ai-usage` | Get AI Usage v1.0.0 | `SqtVWxDsJ4KbAdaQ` |
| `/webhook/intake/lead` (or similar) | Lead Capture v2.1.0 | `FXGmlYKi5Wy1QKX6` |
| `/webhook/admin/db-schema` | Get DB Schema (staging only) | `6RE9D1dQYKeus9a0` |

---

## Standard Node Patterns

### Auth guard (every protected webhook)
```
Webhook → [Utility] Full Auth v2.0.0 (sub-workflow, pass headers.authorization)
        → Full Auth returns { client_id, user_id, role, features[] }
        → IF role === 'staff' for admin-only routes
```

### Feature flag guard
```javascript
// In IF node or Code node after Full Auth
$json.features.includes('feature_name')
// or for admin endpoints with explicit client lookup:
// SELECT enabled FROM caiac.client_features WHERE client_id=$1 AND feature=$2
```

### Feature config read (cap, settings per feature)
```sql
SELECT config FROM caiac.client_features
WHERE client_id = $1 AND feature = 'advanced_ai'
-- config is JSONB: { "cap": 100 } — use config->>'cap' to extract
-- Column is "config", NOT "metadata"
```

### Error handler wiring
```
Error Trigger → [Utility] Handle Workflow Error v1.0.0 (Execute Workflow node)
               Pass: { workflowName: "{{ $workflow.name }}", error: "{{ $json.message }}" }
```

### Webhook path convention
- Client actions: `/{client_slug}/{action}` (e.g., `/caiac/chat`)
- Admin endpoints: `/webhook/admin/{action}` (e.g., `/webhook/admin/ai-usage`)
- Public endpoints: `/webhook/public/{action}` (e.g., `/webhook/public/chat`)
- Auth endpoints: `/caiac/auth/{action}` (e.g., `/caiac/auth/signin`)

---

## DB Schema Quick Reference

### Core tables
| Table | Primary key | Key columns |
|---|---|---|
| `caiac.clients` | `id UUID` | `slug TEXT`, `name`, `active BOOL`, `config JSONB`, `webhook_secret TEXT` |
| `caiac.client_features` | `(client_id, feature)` | `enabled BOOL`, `config JSONB` (not `metadata`) |
| `caiac.client_platform_config` | `client_slug TEXT` | `sheet_id`, `sheet_url`, `client_id UUID` |
| `caiac.users` | `id UUID` | `client_id UUID`, `email`, `role`, `password_hash` |
| `caiac.leads` | `id UUID` | `client_id UUID`, `intake_data JSONB`, `lifecycle_stage`, `crm_external_id` |
| `caiac.sessions` | `id UUID` | `user_id UUID`, `expires_at` |
| `caiac.ai_usage` | `(client_id, period)` | `request_count INT`, `last_used_at` |
| `caiac.quick_action_templates` | `key TEXT` | `label_default`, `prompt`, `active BOOL` |
| `caiac.quick_action_usage` | `(client_id, action_key, period)` | `use_count INT`, `last_used_at` |

### Common queries
```sql
-- Get client
SELECT id, config, webhook_secret FROM caiac.clients WHERE slug = $1 AND active = true

-- Check feature enabled
SELECT enabled FROM caiac.client_features WHERE client_id = $1 AND feature = $2

-- Get feature cap (advanced_ai example)
SELECT COALESCE((config->>'cap')::int, 100) AS cap
FROM caiac.client_features WHERE client_id = $1 AND feature = 'advanced_ai'

-- Get current month AI usage
SELECT request_count FROM caiac.ai_usage
WHERE client_id = $1 AND period = TO_CHAR(NOW(), 'YYYY-MM')
```

---

## Environment Variables on n8n Instances

| Variable | Used by | Notes |
|---|---|---|
| `CAIAC_ENCRYPTION_KEY` | CRM Create Lead | 64-char hex, different between staging and prod |
| `CAIAC_ADMIN_KEY` | Get DB Schema webhook | Header auth for dev tools |
| `JWT_SECRET` | Full Auth | Must match between instances |

---

## CF Pages Environment Variables (caiac-ops-dashboard)

| Variable | Value shape | Notes |
|---|---|---|
| `N8N_WEBHOOK_BASE` | `https://flows.caiacdigital.com/webhook` | **Already includes `/webhook`** — CF functions must NOT add `/webhook/` to their paths |
| `CLIENT_WEBHOOK_SECRET` | secret string | Used for HMAC signing; CF functions read from `X-Webhook-Secret` header first, fall back to this env var |

**Critical rule for CF function authors:** Call `${env.N8N_WEBHOOK_BASE}/admin/my-path` — not `${env.N8N_WEBHOOK_BASE}/webhook/admin/my-path`. The double `/webhook/webhook/` produces a 404 from n8n with no execution log. Old functions use `/caiac/admin/...` paths; new admin functions use `/admin/...` paths — both patterns work as long as the n8n webhook path matches.

---

## Client AI Config — Onboarding Guide

### VPS RAM Constraint (caiac-prod-1)

The production VPS can only run **`llama3.2:1b`** reliably via Ollama. Any larger model is OOM-killed by the Linux kernel:

| Model | RAM needed | Status on prod VPS |
|---|---|---|
| `llama3.2:1b` | ~1 GB | ✅ Works |
| `llama3.2:latest` (3B) | ~2.5 GB | ❌ OOM killed |
| `llama3.1:8b` | ~5 GB | ❌ OOM killed |

### Two AI Tiers

**Tier A — Ollama (free, no API cost):** Simple FAQ/info bots. Fast, no usage cap.
```json
{ "model": "llama3.2:1b", "ollama_url": "http://ollama:11434" }
```

**Tier B — Anthropic Claude (better reasoning, costs money):** Quoting assistants, complex workflows, anything needing structured output or multi-step logic. Requires `advanced_ai` feature enabled on the client.
```json
{
  "provider": "anthropic",
  "claude_model": "claude-haiku-4-5-20251001",
  "model": "llama3.2:1b",
  "ollama_url": "http://ollama:11434"
}
```
The `model` field is the Ollama fallback used when the monthly `advanced_ai` cap is hit.

### Required `config.ai` Fields for Every Client

```json
{
  "provider": null,
  "model": "llama3.2:1b",
  "claude_model": null,
  "ollama_url": "http://ollama:11434",
  "embed_model": "bge-m3:latest",
  "qdrant_url": "http://qdrant:6333",
  "qdrant_collection": "<client-slug>",
  "search_limit": 5,
  "system_prompt": "...",
  "cloud_consent": true
}
```

**Key rules:**
- Always use the key name `model` (not `chat_model`) — the workflow reads `config.ai.model` first
- Always set `search_limit` — if missing, arithmetic produces `NaN` → Qdrant 400
- `qdrant_collection` must match the slug used when documents were indexed
- Never use a model larger than `llama3.2:1b` for Ollama on this VPS

### Current Client AI Configs (as of 2026-07-01)

| Client | Provider | Model | Ollama Fallback |
|---|---|---|---|
| `caiac` | Ollama | `llama3.2:1b` (via `chat_model` key — legacy) | — |
| `henderson` | Ollama | `llama3.2:1b` | — |
| `wallace-chemistry` | Anthropic | Claude Haiku | `llama3.2:1b` |
| `wallace-exterior` | Anthropic | Claude Haiku | `llama3.2:1b` |

---

## Feature Flag Registry

Current KNOWN_FEATURES (in `[Admin] Toggle Client Feature v1.0.0`):
`chat`, `reviews`, `intake`, `crm_sync`, `lead_scoring`, `sms`, `advanced_ai`, `public_chat`

Default enabled at seed time (in `[Onboarding] Seed Client Features v1.0.0`):
- Core (enabled): `chat`, `reviews`, `intake`
- Add-ons (disabled): `crm_sync`, `lead_scoring`, `sms`, `advanced_ai`, `public_chat`
