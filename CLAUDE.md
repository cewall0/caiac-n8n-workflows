# n8n Workflow Builder

## Current Focus

1. **Admin Client Config Panel** — `.claude/plans/admin-client-config-panel.md` — Phase 3 in progress: Step 17 (panel shell + Features tab) ✅ pushed to `dev`. **Next: Step 18 (AI tab — `AIProviderConfig.tsx`)**. Phase T (test infra) T1-T9 done; T10/T11 pending (see OPEN_ITEMS).
2. **Quick Actions frontend** — client-dashboard sends `quick_action_key`, ops-dashboard displays usage; n8n backend is live on prod — see `.claude/plans/quick-actions-and-model-selection.md`
3. **Staging DB separation** — staging n8n still points at prod DB — cewall0 must run Phase 1+2 of `.claude/plans/staging-environment-setup.md` before first paying client

## Active Plans

| Plan | Status | Next action |
|---|---|---|
| [admin-client-config-panel.md](.claude/plans/admin-client-config-panel.md) | IN PROGRESS | Phase 3 Step 18 — AI tab (`AIProviderConfig.tsx`) |
| [quick-actions-and-model-selection.md](.claude/plans/quick-actions-and-model-selection.md) | IN PROGRESS | Frontend PRs + onboarding agent updates |
| [lead-data-architecture.md](.claude/plans/lead-data-architecture.md) | IN PROGRESS | Phase 3 — CRM Create Lead new interface |
| [staging-environment-setup.md](.claude/plans/staging-environment-setup.md) | PLANNED (cewall0) | Phase 1 — create `caiac_staging` DB |
| [test-infrastructure.md](.claude/plans/test-infrastructure.md) | SCAFFOLD BUILT | Phase 0 — fix hardcoded paths, create `.env.test` |
| [tally-api-integration.md](.claude/plans/tally-api-integration.md) | BLOCKED | Waiting on Tally API access |

## Overview
This project directory stores and manages n8n workflows across two environments: **staging** (`flows-staging.caiacdigital.com`) and **production** (`flows.caiacdigital.com`). Claude uses the n8n MCP servers to directly create, update, and manage workflows in the live instances.

Primary workflow types: **automations & integrations**, **webhooks & API workflows**.

## Product

**Kayak** — a white-label AI-powered client portal for independent professional service businesses. Built and operated by CAIAC Digital. Full context: [`docs/kayak-product-strategy.md`](docs/kayak-product-strategy.md).

**Three tiers:**
- **Tier 1 — Chat:** Upload docs → embeddable chat widget. Entry product for businesses with repetitive client Q&A.
- **Tier 2 — Chat + Lead Capture:** Adds lead intake form, automated follow-up sequence, and appointment reminders.
- **Tier 3 — Full Platform:** Adds client portal, full onboarding automation, and the Kayak admin panel.

**Target buyer:** Independent operator, 1–5 people, owner makes the call, no IT department, no approval chain. See strategy doc for the full niche list and demo client profiles.

**CAIAC** is the operating company and first internal client. Wallace Chemistry (`wallace-chemistry` slug) is the first live Tier 1 example (textbook chat widget).

### Environment Rules
- **Staging is the default.** All new workflow builds and edits go to staging unless prod is explicitly requested.
- **Prod writes always require confirmation.** Claude will show what it's about to do and wait for approval before any create/update/delete on prod.
- MCP server names: `n8n` = staging · `n8n-prod` = production

### Key Reference Docs
- **[docs/prod-state.md](docs/prod-state.md)** — Known prod bugs, staged-but-not-deployed workflows, pending deactivations, outstanding PRs. **Read this at the start of every session.** Auto-updated by `/deploy`, `/fix-now`, `/session-end`.
- **[docs/quick-reference.md](docs/quick-reference.md)** — Credential names, workflow IDs, DB patterns, feature flag registry. Check here before building any new workflow.
- **[docs/roles-and-features.md](docs/roles-and-features.md)** — Role hierarchy, document visibility, feature flag registry, guard patterns, and the full checklist for adding a new feature. **Read this before building any new billable feature or modifying the onboarding flow.**
- **[workflows/README.md](workflows/README.md)** — Workflow registry: all active workflows, prod IDs, call graph, and status. **Check this before starting any workflow build or deploy to understand what already exists and what calls what.**

### Adding a New Feature — Required Steps
Every new billable feature must touch all four of these. Missing any one breaks the system:

1. **`[Admin] Toggle Client Feature v1.0.0`** — add the key to `KNOWN_FEATURES` in `Validate Request`
2. **`[Onboarding] Seed Client Features v1.0.0`** — add a `VALUES` row with the default `enabled` state
3. **Run a backfill migration** (temp workflow) — insert the feature row for all existing active clients
4. **Add a feature guard** to the new workflow — see guard patterns in `docs/roles-and-features.md`
5. **Add or update `tests/workflows/<name>.test.ts`** — every webhook that ships to prod needs a test. Update the coverage table in `tests/README.md`. If the workflow changes an existing response shape, update the existing test file.

The onboarding agent (`[Onboarding] CAIAC Client Agent v1.0.0`) calls `seed_features` automatically as step 2 of provisioning. No change to the agent is needed unless you are adding a feature that requires custom onboarding behavior.

---

## Platform Repos

This repo is the **hub** for all automation logic. Three frontend repos connect to it — all API calls from the frontends proxy through Cloudflare Pages Functions → n8n webhooks.

| Repo | What it is | Deploy target | Path |
|---|---|---|---|
| `caiac-website` | Marketing landing page (SSR) | Cloudflare Worker | `../caiac-website` |
| `caiac-client-dashboard` | Client-facing portal (SPA) | Cloudflare Pages | `../caiac-client-dashboard` |
| `caiac-ops-dashboard` | Internal ops tool (SPA) | Cloudflare Pages | `../caiac-ops-dashboard` |

### How They Talk to n8n
All three repos call n8n webhook URLs via their Cloudflare Functions BFF layer:
- Clients/dashboards never call n8n directly — Cloudflare Functions handle auth, HMAC signing, and proxying
- The env var `N8N_WEBHOOK_BASE` in each Pages project points at `https://flows.caiacdigital.com` (prod) or `https://flows-staging.caiacdigital.com` (staging)
- n8n webhook paths follow the convention: `/{client-slug}/{action}` (e.g., `/caiac/chat`, `/caiac/auth/signin`)

### Cross-Repo Features
When a feature spans multiple repos (e.g., new automation + dashboard button + website copy):
1. Create a plan in `.claude/plans/` in this repo — it's the central hub
2. List every repo the feature touches and what changes in each
3. Build n8n workflow first (staging), then frontend changes, then deploy together
4. One PR per repo, link them in each PR description

### Contributors
- `cewall0` — infrastructure, DB, Cloudflare, repo admin
- `lukesgray` — primary dev, n8n workflows, feature builds

### Branching
- `main` → production. Never commit directly to `main`.
- `dev` → staging. All workflow builds and doc changes go here first.
- Feature branches off `dev`: `feat/`, `fix/`, `chore/`
- Hotfixes branch off `main` → PR to `main` → backmerge to `dev`

---

## Setup (First-Time Checklist)

### 1. Install n8n-mcp
```bash
npm install -g n8n-mcp
```
Each developer installs this locally — versions don't need to match exactly across the team. Find your install path with `npm root -g`.

### 2. Get Your n8n API Key
1. Go to `https://flows-staging.caiacdigital.com` → **Settings → n8n API**
2. Click **Create an API key**, give it a name (e.g. your name), and copy it
3. Do the same on prod (`https://flows.caiacdigital.com`) if you need prod access

### 3. Configure the n8n MCP Servers in Claude Code
Real credentials go in **`.mcp.json`** in the project root (gitignored — never committed to GitHub).

```json
{
  "mcpServers": {
    "n8n": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\<you>\\AppData\\Roaming\\npm\\node_modules\\n8n-mcp\\dist\\mcp\\stdio-wrapper.js"],
      "env": {
        "N8N_API_URL": "https://flows-staging.caiacdigital.com",
        "N8N_API_KEY": "YOUR_STAGING_KEY"
      }
    },
    "n8n-prod": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\<you>\\AppData\\Roaming\\npm\\node_modules\\n8n-mcp\\dist\\mcp\\stdio-wrapper.js"],
      "env": {
        "N8N_API_URL": "https://flows.caiacdigital.com",
        "N8N_API_KEY": "YOUR_PROD_KEY"
      }
    }
  }
}
```

> **Note:** Use the direct `node.exe` path (not `npx`) — more reliable on Windows. Find your node path with `where node` and your n8n-mcp path with `npm root -g`.
> `.mcp.json` is gitignored. `.claude/settings.json` (committed) has `enableAllProjectMcpServers: true` to auto-approve both servers.

### Upgrading n8n-mcp
Always pin the exact version — never run `npm install -g n8n-mcp` without a version:
```bash
npm install -g n8n-mcp@2.59.2
```

**Test before reloading Claude** — run the wrapper directly and confirm it hangs (waiting for stdin) rather than throwing an error:
```powershell
& "C:\Program Files\nodejs\node.exe" "C:\Users\lsgra\AppData\Roaming\npm\node_modules\n8n-mcp\dist\mcp\stdio-wrapper.js"
# Should hang silently — Ctrl+C to exit. Any error output means the install is broken.
```

**Known breakage (v2.59.3):** uuid@14 (ESM-only) was pulled in as a sub-dependency, breaking CJS `require()`. Fix: `cd C:\Users\lsgra\AppData\Roaming\npm\node_modules\n8n-mcp && npm install uuid@9`. This patch lives in n8n-mcp's own node_modules and will be overwritten on the next upgrade — re-test after every update.

### 4. Verify the Connection
Ask Claude: _"List my n8n workflows"_ — if the MCP server is working, Claude will return your existing workflows from staging.

---

## Available MCP Tools

Both environments expose the same tools. Prefix with the server name to target an environment:
- Staging (default): `mcp__n8n__<tool>`
- Production: `mcp__n8n-prod__<tool>`

| Tool | Purpose |
|------|---------|
| `n8n_list_workflows` | List all workflows |
| `n8n_get_workflow` | Read a workflow by ID |
| `n8n_create_workflow` | Create a new workflow |
| `n8n_update_full_workflow` | Replace a workflow entirely (used for prod deploys) |
| `n8n_update_partial_workflow` | Patch specific fields of a workflow |
| `n8n_delete_workflow` | Delete a workflow |
| `n8n_activate_workflow` | Activate a workflow |
| `n8n_deactivate_workflow` | Deactivate a workflow |
| `n8n_execute_workflow` | Trigger a manual execution |
| `n8n_executions` | Check recent execution history |
| `n8n_health_check` | Verify the instance is reachable |

---

## Workflow Backup (Required)

**`workflows/` is a git-backed snapshot of production workflows.** It is NOT a staging dump — staging is a sandbox. Only export to `workflows/` when a workflow is prod-ready or already deployed.

### Prod Sync Rule

**At the start of any session that modifies existing prod workflows**, verify the `workflows/*.json` files are current:
- Run `n8n_get_workflow` on prod for each workflow being touched
- If the file's `updatedAt` or `versionCounter` differs from prod, overwrite and commit as `"sync: <name> — catch up to prod"` before making changes
- This ensures git always reflects the real rollback point, not a stale snapshot

This gives you a clean rollback path: git history IS the version history of prod.

### What goes in `workflows/`

- Workflows that are deployed to prod ✅
- Workflows that are staging-tested and ready to deploy ✅
- Half-built staging experiments ❌
- In-progress edits that aren't production-ready yet ❌

### Deploy + Backup Flow (prod)

When deploying a workflow to prod:

1. **Before updating:** `n8n_get_workflow` on the CURRENT prod workflow → overwrite the existing `workflows/` file → commit as `"snapshot: <name> before update"` — this is the rollback point
2. **Deploy:** `n8n_update_full_workflow` on prod with the new JSON (requires user confirmation)
3. **After deploying:** overwrite the file again with the deployed JSON → commit as `"sync: <name> v<version>"`

This two-commit pattern means `git revert HEAD~1` always restores the exact pre-update state.

### Rollback

```bash
# Get the previous prod JSON
git show HEAD~1:workflows/full-auth-v2.0.0.json

# Re-deploy it (requires confirmation)
# Claude reads the file → n8n_update_full_workflow on prod
```

Say _"roll back [workflow name] to the previous version"_ to trigger this flow.

### File Naming

Convert the n8n workflow name to kebab-case and append the version. Drop `[Category]` brackets.

| n8n workflow name | File name |
|---|---|
| `[Auth] Full Auth v2.0.0` | `full-auth-v2.0.0.json` |
| `[Intake] CAIAC Lead Capture v2.0.0` | `intake-lead-capture-v2.0.0.json` |
| `[Onboarding] CAIAC Client Agent v1.0.0` | `onboarding-client-agent-v1.0.0.json` |

### Stale File Cleanup

When a workflow is updated to a new version in prod, delete the old version file. Keep only the current deployed version. If a workflow is deactivated and removed from n8n, remove its file from `workflows/` in the same commit.

---

## Deploy to Prod

**Git is the source of truth.** Workflow JSON lives in `workflows/`. n8n instances are runtime targets, not the source of truth. This gives you version history, diffs, and rollback.

**Standard deploy flow** — after staging is tested and approved:

1. Claude exports the workflow JSON from staging and saves it to `workflows/<name>.json` — committed to git
2. Claude fetches the workflow JSON from staging via `n8n_get_workflow` (staging)
3. Claude checks prod for an existing workflow with the same name via `n8n_list_workflows` (prod)
4. **If new:** `n8n_create_workflow` on prod — requires your confirmation
5. **If updating:** `n8n_update_full_workflow` on prod — requires your confirmation; Claude diffs what's changing first
6. Activation on prod is a separate explicit step — Claude never activates without being told to

**Rollback:** `git revert` the commit → Claude reads the previous JSON → `n8n_update_full_workflow` on prod. Under 2 minutes.

**Rule:** Never edit workflows directly in the n8n UI. Claude via MCP is the only write path — keeps git and prod in sync.

**Credential name requirement:** Credential names must be identical between staging and prod for the workflow JSON to transfer cleanly. Mismatches will be flagged before any prod write.

**Skill:** `/deploy [workflow name]` — handles the full flow, updates `workflows/README.md` and `docs/prod-state.md` automatically.

---

## Database Work

### DB Schema Backup (Required Before Migrations)

**Before running any `ALTER TABLE` migration**, snapshot the affected table(s) to `docs/db-snapshots/` and commit as `"snapshot: <table> before <description>"`. This is the DB equivalent of the workflow pre-update snapshot — the rollback reference point.

**Schema snapshot file:** `docs/db-snapshots/<table>-pre-<description>.md`

Include in each snapshot:
- Current column list (name, type, nullable, default)
- Current constraints (UNIQUE, FK, CHECK)
- The migration SQL about to run
- Rollback SQL if the migration needs to be reversed

**Use `[Admin] Get DB Schema v1.0.0`** (staging, ID: `6RE9D1dQYKeus9a0`) to pull live schema via webhook. Stays staging-only — both environments share the same Postgres DB.

```bash
# Get schema for a table (requires CAIAC_ADMIN_KEY set on n8n instance)
curl "https://flows-staging.caiacdigital.com/webhook/admin/db-schema?table=leads" \
  -H "x-admin-key: <CAIAC_ADMIN_KEY>"
```

**Trigger phrase:** Say _"snapshot the schema before migration"_ to run this flow.

---

Before making any DB architecture decisions, writing migrations, or designing tables — always query the live `caiac` schema directly via the n8n MCP. Do not rely on memory or docs for the current DB state.

Use a Postgres query node or temp workflow to run:

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'caiac'
ORDER BY table_name, ordinal_position;
```

This must be done proactively — do not wait for the user to ask. If the MCP is unavailable, state that you cannot verify the live schema and flag any assumptions explicitly.

---

## Workflow Building Standards

### What Claude Will Ask Before Building
If not provided, Claude must ask for:
- **Trigger**: What starts this workflow? (webhook, schedule, app event, manual trigger)
- **Input data**: What does the payload/data look like? (provide a sample or field list)
- **Destination**: Which app or endpoint receives the output, and what action?
- **Credential names**: What are the existing n8n credential names to use? (never hardcode secrets)
- **Error behavior**: What should happen on failure? (notify via Slack/email, stop silently, retry)
- **Activation**: Should the workflow be activated immediately after creation?

### Required Elements in Every Workflow
1. **Sticky Note** — canvas note describing the workflow purpose, trigger, and any gotchas
2. **Error handling** — either an Error Trigger node connected to a notification, or IF nodes for try/catch logic
3. **Named credentials only** — always reference n8n Credentials Manager; never hardcode API keys, passwords, or tokens in node parameters
4. **Descriptive node names** — rename every node from its default (e.g., "Fetch Order Details" not "HTTP Request1")
5. **Webhook authentication** — any webhook trigger must use Header Auth or Basic Auth; unauthenticated webhooks are not allowed
6. **Tags** — apply at least one tag on every workflow using the platform scheme: `admin`, `auth`, `chat`, `client`, `deprecated`, `intake`, `maintenance`, `onboarding`, `rag`, `reviews`, `utility`. Match the `[Category]` bracket; multi-tag where the workflow spans categories (e.g. a RAG admin tool gets both `rag` + `admin`)

### Security Standards
- **No secrets in workflow JSON** — use n8n's Credentials Manager exclusively for all secrets
- **Webhook security** — every webhook trigger must require authentication (Header Auth preferred)
- **Least privilege** — request only the OAuth scopes or API permissions the workflow actually needs
- **Payload validation** — add an IF node after webhook triggers to verify expected fields are present before processing
- **PII awareness** — avoid logging or storing personally identifiable information in execution data when possible. Set `saveDataSuccessExecution: "none"` on any workflow that processes personal data (name, email, phone, address)
- **PII inventory** — whenever a new DB column, table, or integration stores personal data, update the inventory table in `docs/pii-and-compliance.md` before deploying. Sensitive PII (health, financial, government ID) requires legal review before adding — do not proceed without it
- **Credential scope** — prefer per-workflow credentials over shared credentials when n8n supports it

### Naming Conventions
- **Workflow names**: `[Category] Short Action Description`
  - Examples: `[CRM] Sync New Contacts to HubSpot`, `[Billing] Stripe Webhook → Invoice Record`
- **Node names**: Verb + Object (sentence case)
  - Examples: `Get User Record`, `Send Slack Alert`, `Filter Active Subscriptions`, `Parse Webhook Payload`
- **Webhook paths**: lowercase kebab-case (e.g., `/new-order`, `/stripe-event`)

---

## Workflow Patterns (Reusable)

### Webhook + Validate + Process + Notify
```
Webhook Trigger → Validate Payload (IF) → Process Data → Send Notification
                                        ↘ Error: Send Error Alert
```

### Schedule + Fetch + Transform + Push
```
Schedule Trigger → Fetch from Source → Transform/Filter → Push to Destination → Log Result
```

### App Event → Enrich → Route → Act
```
App Trigger → Enrich Data (HTTP/DB) → Route by Condition (Switch) → Action A / Action B
```

---

## Documentation Routing

When adding or updating information, use this to decide where it belongs:

| What it is | Where it goes |
|---|---|
| Something unresolved, blocked, or not yet built | **`OPEN_ITEMS.md`** (root) |
| Current prod bugs, staged workflows, pending PRs/migrations | **`docs/prod-state.md`** (auto-updated by skills) |
| Credential names, common IDs, DB patterns, feature flags | **`docs/quick-reference.md`** |
| Frontend/site implementation guidance or API usage | **`docs/site-implementation.md`** |
| How a backend system works (feature flags, auth, encryption, etc.) | **`docs/`** — relevant doc or new file |
| Build plans not yet started | **`.claude/plans/`** |
| Completed plan | Move to **`.claude/plans/archive/`** |
| Conventions, decisions, or context for future Claude sessions | **memory files** (`~/.claude/projects/.../memory/`) |

**`OPEN_ITEMS.md` rules:** no duplicates; remove items immediately when resolved; add trailing tasks at end of each session without being asked. **If you can handle something in the current session, handle it — do not log it here. OPEN_ITEMS is for tasks that are genuinely blocked or deferred, not a to-do list of work you could do right now.**

---

## Requesting Missing Information
If Claude needs information to complete a workflow that was not provided, it should ask in a structured format:

> **To complete this workflow, I need:**
> - [ ] The name(s) of the n8n credentials to use for [service]
> - [ ] A sample payload or field list for the incoming data
> - [ ] Confirmation of the webhook path (suggested: `/your-path`)
> - [ ] Error handling preference (notify via [channel]? or silent fail?)

Do not proceed with placeholder values — ask and wait for confirmation.

---

## Session Skills

| Skill | When to use |
|---|---|
| `/deploy [name]` | Deploy a staging workflow to prod with full safety checks + doc updates |
| `/fix-now [description]` | Fix a known prod bug without creating a plan — stages, deploys, clears from prod-state |
| `/session-end` | Run at the end of any session — reconciles docs, surfaces half-finished work, updates prod-state |
| `/run-tests [file\|smoke]` | Run integration or smoke tests against staging/prod |
| `/update-tests [name]` | Update a test file after a workflow response shape changes |
| `/sync-workflows [--fix]` | Audit whether `workflows/*.json` files match prod; pull stale/missing with `--fix` |
| `/admin-sprint [phase]` | Execute a phase of the admin client config panel sprint |
| `/tag-workflows` | Audit and apply missing tags to n8n workflows |

**Completion rule:** Every session that builds something must end with either a deploy to prod, a PR, or an explicit note in `docs/prod-state.md` explaining what's staged and why it's not deployed yet.
