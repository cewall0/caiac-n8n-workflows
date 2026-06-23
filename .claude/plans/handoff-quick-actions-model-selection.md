# Handoff: Quick Actions + Model Selection
**Written: 2026-06-23**
**Author: lukesgray (via Claude)**
**Audience: cewall0 (infrastructure / DB / Cloudflare)**

This document covers everything built, what still needs doing before this ships to prod, and how to test each piece. The feature adds per-client AI chat quick action buttons and a Claude AI upsell with monthly cap enforcement.

---

## What Was Built

### Database (shared — already live, visible to both staging and prod)

Three new tables were created via a migration workflow that ran against the live DB:

```sql
-- Universal prompt templates (5 rows seeded)
caiac.quick_action_templates (key PK, label_default, prompt, active)

-- Claude usage per client per month
caiac.ai_usage (client_id UUID FK, period TEXT, request_count INT, last_used_at TIMESTAMPTZ, PRIMARY KEY (client_id, period))

-- Quick action button clicks per client per month
caiac.quick_action_usage (client_id UUID FK, action_key TEXT, period TEXT, use_count INT, last_used_at TIMESTAMPTZ, PRIMARY KEY (client_id, action_key, period))
```

**Seeded templates (action keys):** `get_quote`, `check_status`, `leave_review`, `book_service`, `ask_question`

The cap for Claude calls lives in `client_features.metadata->>'cap'` on the `advanced_ai` feature row (default 100/month, set at seed time).

Per-client quick action selection lives in `clients.config->'quick_actions'` as a JSONB array:
```json
[
  { "key": "get_quote", "label": "Get a Quote" },
  { "key": "check_status", "label": "Check My Project", "prompt_override": "Optional custom prompt" }
]
```

---

### Workflows Modified (Prod — already deployed)

| Workflow | Prod ID | Change |
|---|---|---|
| `[Admin] Toggle Client Feature v1.0.0` | `QO47fCP6XNuLyS0i` | Added `advanced_ai` to `KNOWN_FEATURES` array |
| `[Onboarding] Seed Client Features v1.0.0` | `lCCkJfPFbNNbHWiI` | Added `advanced_ai` row with `enabled: false` to seed VALUES |
| `[Admin] Update Client Config v1.0.0` | `b8StToReJzg1bzKp` | Added `quick_actions` as an updatable field (writes to `clients.config->'quick_actions'`) |

---

### Workflows Created (Staging — need prod deploy)

| Workflow | Staging ID | Path / Trigger | Purpose |
|---|---|---|---|
| `CAIAC RAG - Chat v2.6.0` | `kvu3hOiGTiuvbVlQ` | Webhook: `caiac/chat/v26-staging` | New chat workflow with Claude branch, cap check, fallback, quick action logging |
| `[Client] Public Config v1.0.0` | `e09qWNZEzTOX866V` | (existing, modified) | Now joins `quick_action_templates` and merges `prompt_override` per client |
| `[Utility] Log AI Usage v1.0.0` | `42DIkRKLfAIzHPOK` | Sub-workflow trigger | Upserts `ai_usage` row after each Claude call |
| `[Admin] Get AI Usage v1.0.0` | `STsGoDCDUJhjBgEE` | Webhook: `admin/ai-usage` (GET) | Returns Claude usage vs cap per client |
| `[Admin] Get Quick Action Usage v1.0.0` | `31C8gxuPexzVWIrH` | Webhook: `admin/quick-action-usage` (GET) | Returns button click counts, stale-first |
| `[Onboarding] Enable Feature v1.0.0` | `9BxuTHAipJJXvM45` | Sub-workflow trigger | Enables a feature for a client (used by onboarding agent) |
| `[Onboarding] Set Quick Actions v1.0.0` | `AzMs6ZLtEPm5pBf3` | Sub-workflow trigger | Writes quick_actions array to clients.config |

---

### Workflows NOT Yet Modified (Needs Work Before Launch)

#### 1. `[Onboarding] CAIAC Client Agent v1.0.0` (Prod ID: `HdNvh02lpP6dV059`)

The onboarding agent needs two new questions in its system prompt (Step 1) and two new tool nodes.

**System prompt changes — add to Step 1 after item 10 (Additional users):**

```
11. **Quick action buttons** — Which 2–4 buttons should appear on the chat widget? Choose from the available templates:
    - get_quote: "Get a Quote"
    - check_status: "Check My Project"
    - leave_review: "Leave a Review"
    - book_service: "Book a Service"
    - ask_question: "Ask a Question"
    Ask the client which they want and what label they'd like (or keep the default).

12. **AI model preference** — Would they like Standard AI (included, Ollama-based) or Advanced AI (Claude — higher quality, billed separately, default cap: 100 requests/month)? If yes, confirm the monthly cap or leave at 100.
```

**Step 3 provisioning — add after `seed_features`:**
```
- If advanced_ai = yes: call enable_feature(client_id, 'advanced_ai')
- Call set_quick_actions(client_id, <JSON array of selected actions with labels>)
```

**Step 4 checklist — add:**
```
- [ ] Advanced AI enabled (if chosen): advanced_ai feature row = true
- [ ] Quick actions configured: clients.config.quick_actions array populated
```

**Two new tool nodes to add to the agent (both toolWorkflow type):**

Tool 1: `enable_feature`
- Workflow ID: `9BxuTHAipJJXvM45` (staging) / deploy to prod first
- Description: "Enable a feature flag for the current client. Use after seed_features if the client opted into advanced AI. Inputs: client_id (uuid string), feature (string — use 'advanced_ai')"
- Input schema: `{ client_id: string, feature: string }`

Tool 2: `set_quick_actions`
- Workflow ID: `AzMs6ZLtEPm5pBf3` (staging) / deploy to prod first
- Description: "Write the client's quick action button configuration. Call this after collecting their selections. Inputs: client_id (uuid string), quick_actions (JSON string — array of {key, label} objects)"
- Input schema: `{ client_id: string, quick_actions: string }`

---

## Testing Steps (Staging)

Work through these in order. Staging base URL: `https://flows-staging.caiacdigital.com`

### 1. Verify DB Tables Exist

Run this via a temp query workflow or psql:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'caiac' AND table_name IN ('quick_action_templates', 'ai_usage', 'quick_action_usage');
-- Should return 3 rows

SELECT * FROM caiac.quick_action_templates;
-- Should return 5 rows (get_quote, check_status, leave_review, book_service, ask_question)
```

### 2. Verify Toggle Client Feature Knows advanced_ai

Call the Toggle endpoint as CAIAC staff with `feature: "advanced_ai"` and `enabled: true` for a test client. Should succeed without "unknown feature" error.

### 3. Verify Seed Client Features Includes advanced_ai

Run Seed for a test client (or check the `client_features` table for any client onboarded after the change). You should see a row with `feature = 'advanced_ai'` and `enabled = false`.

### 4. Test Public Config Returns Quick Actions

1. Set `clients.config->'quick_actions'` for a test client to `[{"key":"get_quote","label":"Get a Quote"},{"key":"check_status","label":"My Project"}]` via a direct DB update or the Update Client Config endpoint.
2. Call `GET /caiac/public-config` (or the equivalent staging path) for that client.
3. Response should include `quick_actions` with each entry having `key`, `label`, and `prompt` (resolved from template).

### 5. Test Chat v2.6.0 — Ollama Path (advanced_ai disabled)

1. Activate Chat v2.6.0 in staging (currently inactive).
2. Sign in as a test client user, get a JWT.
3. POST to `https://flows-staging.caiacdigital.com/webhook/caiac/chat/v26-staging` with valid auth headers + `{ "message": "Hello", "session_id": "test-123" }`.
4. Response should come from Ollama (standard path). Check `Select AI Provider` node — should take the FALSE branch.

### 6. Test Chat v2.6.0 — Claude Path (advanced_ai enabled)

**Before this works:** Add the real Anthropic API key to the `Anthropic API Key` credential in staging (ID: `zkNwWlenCQNOdMse`). Currently set to a placeholder.

1. Enable `advanced_ai` for the test client (`client_features` upsert or call Toggle endpoint).
2. Repeat the chat POST. Should now call Claude and return a Claude response.
3. Check `caiac.ai_usage` — should have a row for that client + current month with `request_count = 1`.

### 7. Test Cap Enforcement

1. Manually update `ai_usage.request_count` to match the cap (default 100) for the test client + current month.
2. Send another chat message.
3. Should fall back to Ollama and write a row to `caiac.audit_log` with `action = 'advanced_ai_cap_hit'`.
4. Check that `format_response` still returns a sensible reply (Ollama fallback, not an error).

### 8. Test Quick Action Key Logging

1. POST to the chat endpoint with `{ "message": "Hi I'd like a quote", "session_id": "test-123", "quick_action_key": "get_quote" }`.
2. Check `caiac.quick_action_usage` — should have a row for `(test_client_id, 'get_quote', YYYY-MM)` with `use_count = 1`.
3. Send again — `use_count` should increment to 2.
4. Send without `quick_action_key` — no new row, no error.

### 9. Test Get AI Usage Endpoint

Activate `[Admin] Get AI Usage v1.0.0` in staging and call:
```
GET https://flows-staging.caiacdigital.com/webhook/admin/ai-usage
Headers: x-caiac-token: <staff JWT>
```
Should return JSON with `{ period, clients: [...] }`. If you have test data from step 6, the test client should appear with `request_count > 0`.

Add `?period=2026-06` to filter to a specific month. Add `?slug=caiac` to filter to a single client.

### 10. Test Get Quick Action Usage Endpoint

Activate `[Admin] Get Quick Action Usage v1.0.0` in staging and call:
```
GET https://flows-staging.caiacdigital.com/webhook/admin/quick-action-usage
Headers: x-caiac-token: <staff JWT>
```
Should return `{ period, actions: [...] }` sorted stale-first (use_count ASC).

---

## Backfill (Run Before Going Live)

Existing clients do not have an `advanced_ai` row in `client_features` (Seed only runs at onboarding). Before launch, run a one-time backfill:

```sql
INSERT INTO caiac.client_features (client_id, feature, enabled, enabled_by)
SELECT id, 'advanced_ai', false, 'system:backfill'
FROM caiac.clients
WHERE active = true
ON CONFLICT (client_id, feature) DO NOTHING;
```

Run this as a temp n8n workflow (Webhook → Code or Postgres node → respond). **Do not run directly on the DB.**

---

## Prod Deploy Checklist

Work through these in order. Each step must be confirmed before the next.

### Phase 1: Pre-flight

- [ ] All staging tests above pass
- [ ] Real Anthropic API key created in prod n8n credentials (same name: `Anthropic API Key`, type: `httpHeaderAuth`, header: `x-api-key`)
- [ ] Credential name matches exactly between staging and prod (required for workflow JSON transfer)
- [ ] CAIAC Postgres credential exists in prod with same name (`CAIAC Postgres`)
- [ ] Full Auth prod workflow ID noted — Chat v2.6.0 calls it by a hardcoded ID (`OpMVWSnQEx9C4S7d` in staging; prod ID is `XWbmBI9NYdwK80eg` — verify Chat v2.6.0's `Call Full Auth` node points to the correct prod ID before deploying)

> **IMPORTANT:** Before deploying Chat v2.6.0 to prod, update the `Call Full Auth` node's workflow ID from the staging Full Auth ID to the prod Full Auth ID (`XWbmBI9NYdwK80eg`). Do this by fetching the staging workflow JSON, editing that node's `workflowId.value`, then pushing to prod.

### Phase 2: Deploy Supporting Sub-workflows to Prod

Deploy these first (they're called by other workflows):

1. `[Onboarding] Enable Feature v1.0.0` — staging ID `9BxuTHAipJJXvM45`
   - Fetch from staging → create in prod → note prod ID → **do not activate yet**

2. `[Onboarding] Set Quick Actions v1.0.0` — staging ID `AzMs6ZLtEPm5pBf3`
   - Same pattern

3. `[Utility] Log AI Usage v1.0.0` — staging ID `42DIkRKLfAIzHPOK`
   - Same pattern — this is called inline from Chat but should exist in prod

### Phase 3: Run Backfill

- [ ] Create temp workflow in prod (Webhook → Postgres → respond) with the backfill SQL above
- [ ] Call it once
- [ ] Verify `SELECT COUNT(*) FROM caiac.client_features WHERE feature = 'advanced_ai'` matches active client count
- [ ] Delete the temp workflow

### Phase 4: Deploy and Activate Public Config Update

The staging `[Client] Public Config v1.0.0` (ID `e09qWNZEzTOX866V`) was modified to join `quick_action_templates`. Deploy this to prod (prod ID `eKe1UmMNCOsLp4vz`) using `n8n_update_full_workflow`. It's safe to deploy and activate immediately — clients without `quick_actions` in their config will get an empty array (no regression).

- [ ] Snapshot prod version before update: `n8n_get_workflow(eKe1UmMNCOsLp4vz)` → save to `workflows/public-config-v1.0.0.json`
- [ ] Deploy updated version
- [ ] Activate
- [ ] Verify: call public config for a test client → `quick_actions` array present in response

### Phase 5: Deploy Chat v2.6.0 to Prod

- [ ] Fetch staging Chat v2.6.0 JSON
- [ ] Update the `Call Full Auth` node `workflowId.value` to prod Full Auth ID (`XWbmBI9NYdwK80eg`)
- [ ] Update Log AI Usage sub-workflow reference to prod ID (from Phase 2)
- [ ] Update webhook path from `caiac/chat/v26-staging` to `caiac/chat` (replacing the v2.5.0 path)
- [ ] Create in prod (do NOT activate yet)
- [ ] Snapshot current prod Chat v2.5.0: `n8n_get_workflow(eZv65sCV7njNG49Z)` → save to `workflows/`
- [ ] Deactivate Chat v2.5.0 on prod
- [ ] Activate Chat v2.6.0 on prod
- [ ] Test with a real chat message — verify response returns

### Phase 6: Deploy Admin Endpoints to Prod

- [ ] Deploy `[Admin] Get AI Usage v1.0.0` (staging ID `STsGoDCDUJhjBgEE`) to prod → activate
- [ ] Deploy `[Admin] Get Quick Action Usage v1.0.0` (staging ID `31C8gxuPexzVWIrH`) to prod → activate

### Phase 7: Update Onboarding Agent

- [ ] Read current agent from prod (`HdNvh02lpP6dV059`)
- [ ] Update system prompt per instructions in "Workflows NOT Yet Modified" section above
- [ ] Add `enable_feature` toolWorkflow node (workflow ID = prod ID from Phase 2, step 1)
- [ ] Add `set_quick_actions` toolWorkflow node (workflow ID = prod ID from Phase 2, step 2)
- [ ] Wire both new tool nodes as `ai_tool` to the Agent node
- [ ] Save (do NOT deactivate — agent should remain live through the update)
- [ ] Test by running an onboarding for a dummy client through the agent

### Phase 8: Deploy Frontend Changes

Both repos have been updated — the code is written and ready to deploy. PRs should be created off `dev` in each repo.

**`caiac-client-dashboard` — files changed:**
- `src/types.ts` — `QuickAction.id` renamed to `QuickAction.key` (matches what the backend now returns)
- `src/lib/api.ts` — `sendChatMessage` accepts optional `quickActionKey` param, includes it in POST body
- `functions/api/chat.ts` — extracts and forwards `quick_action_key` to n8n
- `src/components/ChatView.tsx` — tracks `pendingQuickActionKey` state; set on quick action click, cleared on manual typing, sent with the message then cleared
- `src/components/Dashboard.tsx` — `key={action.id}` → `key={action.key}` in QuickActionsCard

**Dependency:** Public Config (Phase 4) must be deployed first — the client dashboard renders quick action buttons from the `/public-config` response. Before Phase 4 is live, the `quick_actions` array will be empty and no buttons will show (safe — no regression).

**`caiac-ops-dashboard` — files changed:**
- `functions/api/admin-ai-usage.ts` *(new)* — BFF proxy for `GET /admin/ai-usage`
- `functions/api/admin-quick-action-usage.ts` *(new)* — BFF proxy for `GET /admin/quick-action-usage`
- `functions/api/admin-update-client-config.ts` *(new)* — BFF proxy for `POST /admin/update-client-config`
- `src/components/ClientInsights.tsx` *(new)* — Claude usage bar + quick action usage table (stale-first) + inline JSON editor to update quick_actions per client
- `src/App.tsx` — imports and renders `<ClientInsights clientId={clientId} />` above EvalPanel
- `src/App.css` — added `.insights-header` and `.insights-section` layout classes

**Dependency:** Phase 6 (admin n8n endpoints deployed to prod) must be complete before the ops dashboard UI can fetch data.

---

## Rollback Plan

All prod writes follow the two-commit snapshot pattern in CLAUDE.md. If anything breaks:

**Chat rollback (30 seconds):**
1. Deactivate Chat v2.6.0 on prod
2. Reactivate Chat v2.5.0 on prod
3. Users are back on the old path immediately

**Public Config rollback:**
1. `git show HEAD~1:workflows/public-config-v1.0.0.json` to get pre-update JSON
2. `n8n_update_full_workflow` on prod with the old JSON

**DB tables:** They're additive — removing them would require dropping tables. Don't do this unless something is badly wrong. If tables need to be cleared, truncate rather than drop.

---

## Known Gaps / Follow-On Work

- **Cap is not yet editable via ops dashboard** — `client_features.metadata->>'cap'` must be updated directly in the DB for now. The Update Client Config workflow only handles `clients.config` fields. A new endpoint or direct DB update path is needed.
- **Onboarding agent not yet updated** — documented above; must be done before the first client onboards after launch.
- **No alert sent when cap is hit** — the `Alert Cap Hit` node in Chat v2.6.0 writes to `audit_log` but does not send a Slack/email notification yet. Add a Slack webhook node or extend [Utility] Handle Workflow Error to cover this case.
- **Frontend code is written but not deployed** — both repos have the changes committed on `dev`. PRs need to be created and merged. See Phase 8 for the full file list.
