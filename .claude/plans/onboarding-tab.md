# Onboarding Tab — Ops Dashboard

**Status: PLANNED**
**Repos touched:** `caiac-n8n-workflows`, `caiac-ops-dashboard`
**Created:** 2026-06-30
**Completes:** admin-client-config-panel.md step 16 (deferred Onboarding tab)

---

## Goal

Replace the "Onboarding — coming soon." placeholder in `ClientConfigPanel` with a two-section functional tab:

1. **New Client Onboarding** — independent of the currently selected client; chat-driven provisioning of a brand-new client via the existing onboarding agent (secured)
2. **Client Update / Configure** — scoped to the selected client; shows provisioning state and allows safe re-runs and config updates

These are distinct problems and stay visually and functionally separate within the same tab.

---

## Two-Section Architecture

```
┌─ Onboarding Tab ──────────────────────────────────────────────────────────────┐
│                                                                                 │
│  ┌─ Section 1: New Client Onboarding ──────────────────────────────────────┐  │
│  │  Slug: [henderson-hvac        ]  [Start]                                 │  │
│  │  ─────────────────────────────────────────────────────────────────────  │  │
│  │  Chat window (full onboarding agent — independent session per slug)      │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌─ Section 2: Current Client — Update & Configure ────────────────────────┐  │
│  │  Henderson HVAC (henderson-hvac)                                          │  │
│  │  ✓  Create client record                                                  │  │
│  │  ✓  Create user                                                           │  │
│  │  ✓  Setup lead sheet                                          [↺ Re-run]  │  │
│  │  ✗  Stub CRM config                                                       │  │
│  │  ✓  Seed features                                             [↺ Re-run]  │  │
│  │  Features: chat, intake, public_chat                                       │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Section 1 (New Client Onboarding):**
- Has its own slug input. The new client's slug is independent of the panel's current client slug.
- Opens a fresh chat session scoped to the entered slug.
- The onboarding agent handles all provisioning logic through conversation.
- Session is keyed to `{staffUserId}:{newSlug}` — switching slugs starts a new session.

**Section 2 (Client Update / Configure):**
- Always scoped to the panel's current slug (`props.slug`).
- Loads state on tab open. No chat here — actions are explicit buttons.
- Re-run buttons for safe steps only. Blocked steps not shown.

---

## What Already Exists — Do Not Rebuild

| Thing | Prod ID | Notes |
|---|---|---|
| `[Onboarding] CAIAC Client Agent v1.0.0` | `HdNvh02lpP6dV059` | Full provisioning AI agent. Uses `chatTrigger` — **no auth, not safe to expose directly**. |
| `[Onboarding] Get Client State v1.0.0` | `opOrQB7kDGlEE8so` | Sub-workflow. Returns `exists`, `steps_completed`, `enabled_features`, `all_features`. |
| `[Onboarding] Create Client Record v1.0.0` | `AvNGCwKF3BtOLl2Y` | Sub-workflow |
| `[Onboarding] Seed Client Features v1.0.0` | `lCCkJfPFbNNbHWiI` | Sub-workflow (UPSERT — safe to re-run) |
| `[Onboarding] Create Client User v1.0.0` | `8MnKBfVjMUrvbmMq` | Sub-workflow |
| `[Onboarding] Setup Client Sheet v1.0.0` | `qS8R4WROB0zrJppB` | Sub-workflow (UPSERT — safe to re-run) |
| `[Onboarding] Stub CRM Config v1.0.0` | `8AZ4sMI7CRXByH8I` | Sub-workflow (UPSERT — safe to re-run) |
| `[Onboarding] Send Welcome Email v1.0.0` | `Gh2FE8DSQbulc4hL` | Sub-workflow (resend — safe) |
| `[Onboarding] Smoke Test v1.0.0` | `1Wmm68uc0ZnWegVK` | Sub-workflow (read-only — safe) |
| `[Onboarding] Generate Field Map v1.0.0` | `dD39CCxzxczQ8820` | Sub-workflow |
| `[Onboarding] Enable Feature v1.0.0` | `ZlpKZ33mNhU3ek24` | Sub-workflow (UPSERT — safe to re-run) |
| `[Onboarding] Set Quick Actions v1.0.0` | `AhYVwYN7hi0Tti0y` | Sub-workflow (UPSERT — safe to re-run) |

**Why not expose the existing Chat Trigger directly:** `chatTrigger` has no auth — any caller who knows `https://flows.caiacdigital.com/webhook/caiac-onboarding-agent-v1/chat` can provision real clients. We gate it behind a new secured webhook.

---

## Security Model

| Layer | Mechanism |
|---|---|
| Browser → CF Function | Staff JWT in `Authorization: Bearer` header |
| CF Function → n8n | HMAC signature (`x-caiac-signature` + `x-caiac-timestamp`) |
| n8n webhook (all 3) | Header Auth credential |
| n8n: staff guard | `[Utility] Full Auth v2.0.0` called first; asserts `is_caiac_staff = true` |
| Session isolation | `session_id = {staffUserId}:{targetSlug}` — constructed server-side by CF Function; browser never sends session_id |
| Re-run blocklist | `create_client` and `create_user` hardcoded blocked in n8n — return 400 with human-readable reason |
| Temp passwords | Agent workflow sets `saveDataSuccessExecution: "none"` — temp passwords never appear in execution logs |
| CRM updates | `stub_crm_config` is UPSERT — safe to re-run; only sets CRM type stub, never touches API keys |

**Onboarding agent security fix (first task):** The existing `[Onboarding] CAIAC Client Agent v1.0.0` has `saveDataSuccessExecution: "all"`. Change to `"none"` before doing anything else. The `create_user` tool returns a temp password — it is currently logged in every execution.

---

## n8n Workflows to Build

### Workflow A — `[Admin] Get Onboarding State v1.0.0`

**Purpose:** Returns provisioning state for a given slug. Powers Section 2.

**Trigger:** `GET /admin/onboarding-state?slug={slug}`, Header Auth

**Node sequence:**
1. Webhook Trigger (GET, responseMode: responseNode, Header Auth)
2. Prepare Auth — Code: extract Bearer token, timestamp, signature from headers
3. Call Full Auth — Execute Workflow → `[Utility] Full Auth v2.0.0`; assert `is_caiac_staff`
4. Validate Slug — Code: assert `query.slug` present, alphanumeric+hyphens only
5. Call Get Client State — Execute Workflow → `[Onboarding] Get Client State v1.0.0` (`opOrQB7kDGlEE8so`) with `{ client_slug: slug }`
6. Respond 200 — respondToWebhook with state object
7. Error responses: 400 (bad input), 401 (no auth), 403 (not staff), 500
8. Error Trigger → Respond 500

**Response shape:**
```json
{
  "exists": true,
  "client_id": "uuid",
  "client_name": "Henderson HVAC",
  "steps_completed": {
    "create_client": true,
    "create_user": true,
    "setup_sheet": true,
    "stub_crm_config": false,
    "seed_features": true
  },
  "enabled_features": ["chat", "intake"],
  "all_features": { "chat": true, "intake": true, "reviews": false }
}
```

**Settings:** `saveDataSuccessExecution: "none"`

---

### Workflow B — `[Admin] Rerun Onboarding Step v1.0.0`

**Purpose:** Re-runs a single safe provisioning step for an existing client. Powers Section 2 re-run buttons.

**Trigger:** `POST /admin/rerun-onboarding-step`, Header Auth

**Body:** `{ slug: string, step: string, params?: object }`

**Safe steps — allowed:**

| `step` value | Sub-workflow | Notes |
|---|---|---|
| `setup_sheet` | `[Onboarding] Setup Client Sheet v1.0.0` (`qS8R4WROB0zrJppB`) | UPSERT |
| `seed_features` | `[Onboarding] Seed Client Features v1.0.0` (`lCCkJfPFbNNbHWiI`) | UPSERT — adds missing rows, does not remove existing |
| `stub_crm_config` | `[Onboarding] Stub CRM Config v1.0.0` (`8AZ4sMI7CRXByH8I`) | UPSERT on `client_crm_configs` |
| `send_welcome_email` | `[Onboarding] Send Welcome Email v1.0.0` (`Gh2FE8DSQbulc4hL`) | Resend; requires temp_password in params |
| `smoke_test` | `[Onboarding] Smoke Test v1.0.0` (`1Wmm68uc0ZnWegVK`) | Read-only |

**Blocked steps — return 400:**

| `step` value | Reason |
|---|---|
| `create_client` | "Cannot re-run: would create a duplicate client record. Use the onboarding chat to add features or update config for an existing client." |
| `create_user` | "Cannot re-run: would create a duplicate user. Use Manage Client User to add or modify users." |

**Node sequence:**
1. Webhook Trigger (POST, responseMode: responseNode, Header Auth)
2. Prepare Auth
3. Call Full Auth → assert `is_caiac_staff`
4. Validate Request — Code:
   - Assert `slug`, `step` present
   - If `step` in BLOCKED_STEPS → Respond 400 with reason
   - If `step` not in ALLOWED_STEPS → Respond 400 "Unknown step"
   - Fetch `client_id` from DB: `SELECT id FROM caiac.clients WHERE slug = $1 AND active = true` (parameterized — `$1`)
   - If no result → Respond 404 "Client not found"
5. Merge client_id into request data
6. Switch node → one output per allowed step
7. One Execute Workflow node per step (using `client_id` from DB + `params` from request body)
8. Build Response — `{ success: true, step, result }`
9. Respond 200
10. Error nodes (400, 401, 403, 404, 500)

**Settings:** `saveDataSuccessExecution: "none"` (send_welcome_email params include temp_password)

---

### Workflow C — `[Admin] Onboarding Chat v1.0.0`

**Purpose:** Secured onboarding agent for the ops dashboard. Powers Section 1 chat. This is a secured copy of the existing agent — the existing agent (Chat Trigger, no auth) is left unchanged.

**Trigger:** `POST /admin/onboarding-chat`, Header Auth

**Body:** `{ message: string, session_id: string }`
(session_id constructed server-side by CF Function — browser never sends it)

**Node sequence:**
1. Webhook Trigger (POST, responseMode: responseNode, Header Auth)
2. Prepare Auth
3. Call Full Auth → assert `is_caiac_staff`
4. Validate Body — Code:
   - Assert `message` is non-empty string, max 2000 chars
   - Assert `session_id` matches `^[a-z0-9-]{8,64}:[a-z0-9-]{1,64}$` (staffUserId:slug format)
   - Return 400 if validation fails
5. Set Chat Input — Code: `return [{ json: { chatInput: $json.body.message, sessionId: $json.body.session_id } }]`
6. Onboarding Agent — `@n8n/n8n-nodes-langchain.agent` typeVersion 1.8
   - LLM: Claude Sonnet 4.6, temperature 0.3 (same credential as existing agent)
   - Memory: Window Buffer Memory (30 messages), sessionKey: `sessionId`
   - System prompt: **copied verbatim** from `[Onboarding] CAIAC Client Agent v1.0.0` — do not modify; if the prompt changes, update both workflows
   - Tools: same 10 sub-workflows (9 existing + `enable_feature`)
7. Respond 200 — `{ output: agentOutput }`
8. Error Trigger → Respond 500

**Tools in this workflow (prod IDs):**

| Tool name | Prod ID |
|---|---|
| `get_client_state` | `opOrQB7kDGlEE8so` |
| `generate_field_map` | `dD39CCxzxczQ8820` |
| `create_client` | `AvNGCwKF3BtOLl2Y` |
| `seed_features` | `lCCkJfPFbNNbHWiI` |
| `create_user` | `8MnKBfVjMUrvbmMq` |
| `setup_client_sheet` | `qS8R4WROB0zrJppB` |
| `stub_crm_config` | `8AZ4sMI7CRXByH8I` |
| `send_welcome_email` | `Gh2FE8DSQbulc4hL` |
| `smoke_test` | `1Wmm68uc0ZnWegVK` |
| `enable_feature` | `ZlpKZ33mNhU3ek24` |

**Settings:** `saveDataSuccessExecution: "none"`, `saveDataErrorExecution: "all"`

> **Staging note:** Tool IDs differ between staging and prod. When building in staging, look up staging IDs via `n8n_list_workflows`. When deploying to prod, swap all tool IDs to the prod IDs in the table above. Verify every ID before prod deploy — mismatched IDs are the most common source of silent agent failures.

---

## CF Functions (ops-dashboard `functions/api/`)

### `admin-onboarding-state.ts`

```typescript
// GET /api/admin-onboarding-state?slug=X
// Validates staff JWT, proxies to n8n GET /admin/onboarding-state?slug=X
```

- Reads `slug` from URL query params
- Validates slug format (alphanumeric + hyphens, non-empty)
- Forwards with HMAC + Authorization header
- Returns n8n response body unchanged

### `admin-rerun-onboarding-step.ts`

```typescript
// POST /api/admin-rerun-onboarding-step
// Body: { slug, step, params? }
```

- Reads JSON body
- Validates `slug` and `step` present
- Forwards with HMAC + Authorization header
- Returns `{ success, step, result }` or error from n8n

### `admin-onboarding-chat.ts`

```typescript
// POST /api/admin-onboarding-chat
// Body: { message, target_slug }
// Constructs session_id server-side: `${verifiedStaffUserId}:${target_slug}`
```

- Validates JWT, extracts `sub` (staff user ID)
- Reads `target_slug` from body (the slug being onboarded — may differ from panel's current slug)
- Constructs `session_id = ${staffUserId}:${target_slug}`
- Posts `{ message, session_id }` to n8n with HMAC + Authorization
- Returns `{ output }` from n8n

**Why `target_slug` not `slug`:** Section 1 always passes the NEW client's slug, which may differ from the panel's `props.slug`. The CF Function builds the session ID from this target slug.

---

## Frontend — `OnboardingTab.tsx`

**File:** `src/components/tabs/OnboardingTab.tsx`
**Props:** `{ slug: string }` (the currently selected client's slug)

### Section 1: New Client Onboarding

**State:**
```typescript
type NewClientState = {
  targetSlug: string;
  messages: ChatMessage[];
  isLoading: boolean;
  sessionActive: boolean;
};
```

**Behavior:**
- Slug input + "Start" button (disabled if `targetSlug` is empty or invalid)
- Clicking Start sends a priming message to the chat: `"I want to onboard a new client. The slug will be: ${targetSlug}"` — visible in the chat as the first user message
- Chat input + Send button below the message history
- "Clear / New Client" button resets slug input and clears messages
- If the entered slug already exists (the agent will say so after checking state), the agent naturally transitions to update-mode for that client within the chat — no special frontend handling needed

**Chat message call:**
```typescript
POST /api/admin-onboarding-chat
{ message: string, target_slug: targetSlug }
```

### Section 2: Current Client — Update & Configure

**State:**
```typescript
type ProvisioningState = {
  status: 'loading' | 'loaded' | 'error';
  exists: boolean;
  client_id: string | null;
  client_name: string | null;
  steps_completed: Record<string, boolean>;
  enabled_features: string[];
};
```

**Step display labels:**
```
create_client  → "Create client record"
create_user    → "Create user account"
setup_sheet    → "Setup lead sheet"
stub_crm_config → "Stub CRM config"
seed_features  → "Seed feature flags"
```

**Re-run button visibility:**

| Step | Show re-run? | Notes |
|---|---|---|
| `setup_sheet` | ✓ | Collect `owner_email`, `google_review_link` in inline form first |
| `seed_features` | ✓ | No params needed — uses `client_id` from state |
| `stub_crm_config` | ✓ | Collect `crm_type` in inline form first |
| `send_welcome_email` | ✓ | Collect `email`, `first_name`, `role`, `temp_password`, `sheet_url` in inline form |
| `smoke_test` | ✓ | No params needed |
| `create_client` | ✗ | Not shown |
| `create_user` | ✗ | Not shown |

**Re-run flow:**
1. Click ↺ button
2. If params required: show inline mini-form below the step row with required fields
3. Show confirmation: "Re-run [Step Name]?"
4. On confirm: `POST /api/admin-rerun-onboarding-step { slug, step, params }`
5. Button shows spinner during request
6. On success: refresh state (`GET /api/admin-onboarding-state?slug={slug}`), show ✓ flash on row
7. On failure: show inline error under the step row with the message from n8n

**State load errors:** Show "Could not load provisioning state" with a Retry button.

### Register in `ClientConfigPanel.tsx`

```tsx
// Replace the catch-all "coming soon" with explicit onboarding render:
{activeTab === "onboarding" && (
  <OnboardingTab slug={slug} />
)}
// Keep catch-all for any truly unimplemented tabs:
{activeTab !== "overview" && activeTab !== "features" && activeTab !== "ai"
  && activeTab !== "config" && activeTab !== "reviews" && activeTab !== "users"
  && activeTab !== "analytics" && activeTab !== "onboarding" && (
  <p style={{ padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.9rem", margin: 0 }}>
    {TABS.find(t => t.id === activeTab)?.label} — coming soon.
  </p>
)}
```

---

## Build Order

Do these in sequence — each step unlocks the next.

| # | Task | Environment | Notes |
|---|---|---|---|
| 0 | Fix `saveDataSuccessExecution` on existing agent | Prod | First — temp passwords are being logged now |
| 1 | `[Admin] Get Onboarding State v1.0.0` | Staging | Build + test |
| 2 | `[Admin] Rerun Onboarding Step v1.0.0` | Staging | Build + test; verify BLOCKED_STEPS return 400 |
| 3 | `[Admin] Onboarding Chat v1.0.0` | Staging | Build + test; verify memory across messages |
| 4 | Deploy 1, 2, 3 to prod | Prod | After staging tests pass; confirm each before deploy |
| 5 | CF Functions (all 3) | ops-dashboard | After prod deploy of 1, 2, 3 |
| 6 | `OnboardingTab.tsx` + register in ClientConfigPanel | ops-dashboard | After CF Functions |
| 7 | TypeScript clean, PR opened | ops-dashboard | Branch: `feat/onboarding-tab` |

---

## Tests

### `tests/workflows/admin-onboarding-state.test.ts`
- ✅ Existing client → 200 + `exists: true` + all step fields present
- ✅ Non-existent client → 200 + `exists: false`
- ❌ Missing slug → 400
- ❌ No auth → 401
- ❌ Client JWT (not staff) → 403

### `tests/workflows/admin-rerun-onboarding-step.test.ts`
- ✅ `step: "smoke_test"` → 200 + `result` present
- ✅ `step: "seed_features"` → 200; verify `client_features` rows in DB
- ❌ `step: "create_client"` → 400 + `reason` string
- ❌ `step: "create_user"` → 400 + `reason` string
- ❌ Unknown step → 400
- ❌ No auth → 401
- ❌ Missing slug → 400

### `tests/workflows/admin-onboarding-chat.test.ts`
- ✅ "hello" → 200 + `output` non-empty string
- ✅ Two messages same session → second reply references first (memory working)
- ❌ No auth → 401
- ❌ Empty message → 400
- ❌ Message > 2000 chars → 400

### `tests/e2e/ops-dashboard/panel-onboarding.spec.ts`
- Tab renders (not "coming soon")
- Section 1: slug input + Start button visible
- Section 2: step list loads for CAIAC client
- Section 2: re-run button present for `seed_features`, absent for `create_client`
- Section 2: smoke_test re-run → success indicator shown
- Section 1: Start button sends message → response appears

---

## Safe Config Updates Reference

| What the operator wants | Right path | Safe? |
|---|---|---|
| Enable a new feature for existing client | Section 1 chat → agent calls `enable_feature` | ✅ UPSERT |
| Re-seed all features | Section 2 → re-run `seed_features` | ✅ UPSERT; adds missing rows, doesn't remove existing |
| Re-stub CRM config | Section 2 → re-run `stub_crm_config` | ✅ UPSERT; doesn't touch API keys |
| Resend welcome email | Section 2 → re-run `send_welcome_email` with new temp password | ✅ Just sends email |
| Re-setup lead sheet | Section 2 → re-run `setup_sheet` | ✅ UPSERT; overwrites sheet config — warn in UI |
| Add a second user | Use "Manage Client User" tab | Not in Onboarding tab |
| Change AI model or cap | Use "AI" tab | Not in Onboarding tab |
| Onboard a completely new client | Section 1 chat | Full provisioning |
| Resume a partial onboarding | Section 1 chat (agent reads `get_client_state` automatically) | Agent skips completed steps |

---

## Why It Got Lost

The original admin-client-config-panel plan deferred step 16 with no explanation of scope or follow-up. `OnboardingLauncher.tsx` was listed as a component but never spec'd out. `ClientConfigPanel.tsx` ended up with a generic "coming soon" catch-all because the onboarding component was never built. This plan is the explicit replacement for that deferred step — once complete, step 16 in admin-client-config-panel.md can be marked ✅.
