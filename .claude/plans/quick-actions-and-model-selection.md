# Plan: Quick Actions + Model Selection (Ollama vs Claude)

**Status: LIKELY COMPLETE — Chat v2.6.0 LIVE ON PROD (2026-06-27); frontend pieces absorbed into the ops-dashboard redesign sprint (mighty-squishing-summit.md)**
**Date: 2026-06-23 | Updated: 2026-07-02**
**2026-07-02 spot-check:** `caiac-ops-dashboard/src/components/AIProviderConfig.tsx` already has Claude cap display + edit UI (`savedCap`, `saveCap()`, cap presets). `quick_action` references exist in `AnalyticsTab.tsx`, `ClientInsights.tsx`, `ConfigTab.tsx` (ops-dashboard) and `AIAssistant.tsx`, `ChatView.tsx`, `Dashboard.tsx`, `api.ts`, `types.ts` (client-dashboard) — strongly suggests the remaining frontend rows in the table below already shipped under the redesign sprint rather than this plan. Not verified line-by-line against this plan's original spec — worth a closer pass before marking IMPLEMENTED, but nothing here looks like open work.
**⚠ Handoff doc deleted — deploy checklist superseded; remaining items tracked here and in admin-client-config-panel.md**

---

## Goal

Two related per-client configuration features:

1. **Quick Actions** — client-specific conversation starter buttons on the site. Universal prompt templates per action type with per-client label overrides and optional prompt tweaks. Track usage per client so ops can swap stale buttons.

2. **Model Selection** — during onboarding, clients choose standard (Ollama) or advanced (Claude) AI. Claude is a billable upsell with a configurable monthly cap. At cap: fall back to Ollama transparently and alert ops.

---

## DB Migrations (Critical Path — Run First)

```sql
-- Universal prompt templates, one row per action type
CREATE TABLE caiac.quick_action_templates (
  key TEXT PRIMARY KEY,
  label_default TEXT NOT NULL,
  prompt TEXT NOT NULL,
  active BOOLEAN DEFAULT true
);

-- Seed starter templates
INSERT INTO caiac.quick_action_templates (key, label_default, prompt) VALUES
  ('get_quote',      'Get a Quote',         'Hi, I''d like to get a quote for your services.'),
  ('check_status',   'Check My Project',    'Hi, I''d like to check on the status of my project.'),
  ('leave_review',   'Leave a Review',      'Hi, I''d like to leave a review for my recent service.'),
  ('book_service',   'Book a Service',      'Hi, I''d like to book a service appointment.'),
  ('ask_question',   'Ask a Question',      'Hi, I have a question I''d like to ask.');

-- Claude usage tracking, upserted per client per month
CREATE TABLE caiac.ai_usage (
  client_id INT REFERENCES caiac.clients(id),
  period TEXT NOT NULL,           -- 'YYYY-MM'
  request_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  PRIMARY KEY (client_id, period)
);

-- Quick action usage tracking, upserted per client per action per month
CREATE TABLE caiac.quick_action_usage (
  client_id INT REFERENCES caiac.clients(id),
  action_key TEXT NOT NULL,
  period TEXT NOT NULL,           -- 'YYYY-MM'
  use_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  PRIMARY KEY (client_id, action_key, period)
);
```

Cap lives in `client_features` **`config`** (not `metadata`): `{ "cap": 100 }` on the `advanced_ai` feature row.
⚠ Chat v2.6.0 on prod has the cap hardcoded to `100` — does not read from `client_features.config`. Fix is Phase 1 of `admin-client-config-panel.md`.

Per-client `clients.config.quick_actions` shape:
```json
[
  { "key": "get_quote",    "label": "Get a Quote" },
  { "key": "check_status", "label": "Check My Project", "prompt_override": "Custom prompt..." }
]
```

---

## Repos Touched

| Repo | Changes |
|---|---|
| `caiac-n8n-workflows` | All workflow changes (this repo) |
| `caiac-client-dashboard` | Send `quick_action_key` in chat payload when button clicked |
| `caiac-ops-dashboard` | Display quick action usage + Claude usage per client; allow updating quick_actions + cap |

---

## Workflow Changes

### caiac-n8n-workflows

| Workflow | Change | Status |
|---|---|---|
| DB Migration (temp workflow) | Run 3 CREATE TABLE + INSERT statements | ✅ DONE |
| `[Admin] Toggle Client Feature v1.0.0` | Add `advanced_ai` to `KNOWN_FEATURES` | ✅ DONE (prod) |
| `[Onboarding] Seed Client Features v1.0.0` | Add `advanced_ai` row — `enabled: false` | ✅ DONE (prod) |
| `[Onboarding] CAIAC Client Agent v1.0.0` | Capture: which quick_actions, want advanced AI? + 2 new tool nodes | ☐ PENDING |
| `[Client] Public Config v1.0.0` | JOIN `quick_action_templates`, merge `prompt_override` | ✅ DONE (staging — deploy to prod pending) |
| `CAIAC RAG - Chat v2.6.0` | Branch on `advanced_ai` flag → cap check → Claude or Ollama; log quick_action_key | ✅ LIVE ON PROD (`kgEgpT7XL7KuKD0z`) — cap hardcoded 100 |
| `[Admin] Update Client Config v1.0.0` | Add `quick_actions` as updatable field | ✅ DONE (prod) |
| **New** `[Utility] Log AI Usage v1.0.0` | Upsert `ai_usage` row after each Claude call | ✅ DONE (staging — deploy in Phase 2) |
| **New** `[Admin] Get AI Usage v1.0.0` | Return Claude usage + cap per client for ops dashboard | ✅ DONE (staging — deploy in Phase 6) |
| **New** `[Admin] Get Quick Action Usage v1.0.0` | Return use_count + last_used_at per client per action, sorted stale-first | ✅ DONE (staging — deploy in Phase 6) |
| **New** `[Onboarding] Enable Feature v1.0.0` | Sub-workflow: enable a feature for a client | ✅ DONE (staging — deploy in Phase 2) |
| **New** `[Onboarding] Set Quick Actions v1.0.0` | Sub-workflow: write quick_actions to clients.config | ✅ DONE (staging — deploy in Phase 2) |

### caiac-client-dashboard

| Change | Status |
|---|---|
| Add `quick_action_key` to chat POST payload when quick action button is clicked | ☐ |

### caiac-ops-dashboard

| Change | Status |
|---|---|
| Quick action usage table per client | ☐ |
| Claude usage + cap display per client | ☐ |
| Edit quick_actions per client (calls `[Admin] Update Client Config`) | ☐ |
| Edit Claude cap per client (calls `[Admin] Update Client Config`) | ☐ |

---

## Chat Branch Logic (v2.6.0 — LIVE)

```
Auth → Get Client Config → Check advanced_ai feature flag
  ├─ disabled OR not found → Ollama path (unchanged)
  └─ enabled
        └─ Check ai_usage vs cap (current month)
              ├─ under cap → Claude API → Log AI Usage
              └─ at/over cap → Ollama path + Alert ops (Slack/email)

(anywhere in flow) → if quick_action_key in payload → upsert quick_action_usage
```

---

## Get Quick Action Usage Response Shape

```json
[
  { "key": "leave_review",  "label": "Leave a Review",   "use_count": 0,  "last_used_at": null,  "period": "2026-06" },
  { "key": "check_status",  "label": "Check My Project", "use_count": 3,  "last_used_at": "...", "period": "2026-06" },
  { "key": "get_quote",     "label": "Get a Quote",      "use_count": 42, "last_used_at": "...", "period": "2026-06" }
]
```

Sorted `use_count ASC` — stale buttons at top.

---

## Build Order

1. DB migrations (temp n8n workflow → run → delete)
2. Feature flag: Toggle + Seed workflows
3. `[Client] Public Config v1.0.0` — templates join
4. `[Utility] Log AI Usage v1.0.0` — new sub-workflow
5. `CAIAC RAG - Chat v2.5.0` — Claude branch + usage check + quick_action logging
6. `[Onboarding] CAIAC Client Agent v1.0.0` — model + quick_actions questions
7. `[Admin] Update Client Config v1.0.0` — quick_actions + cap fields
8. `[Admin] Get AI Usage v1.0.0` — new endpoint
9. `[Admin] Get Quick Action Usage v1.0.0` — new endpoint
10. `caiac-client-dashboard` — send quick_action_key
11. `caiac-ops-dashboard` — usage displays + edit UIs

---

## PRs (one per repo)

- `caiac-n8n-workflows` — workflow JSON exports, this plan, README updates
- `caiac-client-dashboard` — quick_action_key in chat payload
- `caiac-ops-dashboard` — usage tables + config edit UI
