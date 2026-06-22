# n8n Workflow Builder

## Overview
This project directory stores and manages n8n workflows across two environments: **staging** (`flows-staging.caiacdigital.com`) and **production** (`flows.caiacdigital.com`). Claude uses the n8n MCP servers to directly create, update, and manage workflows in the live instances.

Primary workflow types: **automations & integrations**, **webhooks & API workflows**.

### Environment Rules
- **Staging is the default.** All new workflow builds and edits go to staging unless prod is explicitly requested.
- **Prod writes always require confirmation.** Claude will show what it's about to do and wait for approval before any create/update/delete on prod.
- MCP server names: `n8n` = staging · `n8n-prod` = production

### Key Reference Docs
- **[docs/roles-and-features.md](docs/roles-and-features.md)** — Role hierarchy, document visibility, feature flag registry, guard patterns, and the full checklist for adding a new feature. **Read this before building any new billable feature or modifying the onboarding flow.**

### Adding a New Feature — Required Steps
Every new billable feature must touch all four of these. Missing any one breaks the system:

1. **`[Admin] Toggle Client Feature v1.0.0`** — add the key to `KNOWN_FEATURES` in `Validate Request`
2. **`[Onboarding] Seed Client Features v1.0.0`** — add a `VALUES` row with the default `enabled` state
3. **Run a backfill migration** (temp workflow) — insert the feature row for all existing active clients
4. **Add a feature guard** to the new workflow — see guard patterns in `docs/feature-flags.md`

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

### 1. Get Your n8n API Key
1. Open your n8n instance (e.g., `http://localhost:5678`)
2. Go to **Settings → n8n API**
3. Click **Create an API key**, give it a name, and copy the key

### 2. Configure the n8n MCP Servers in Claude Code
Real credentials go in **`.claude/settings.local.json`** (gitignored — never committed to GitHub).

Two servers are configured — one per environment:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "env": {
        "N8N_API_URL": "https://flows-staging.caiacdigital.com",
        "N8N_API_KEY": "YOUR_STAGING_KEY"
      }
    },
    "n8n-prod": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "env": {
        "N8N_API_URL": "https://flows.caiacdigital.com",
        "N8N_API_KEY": "YOUR_PROD_KEY"
      }
    }
  }
}
```

> **Note:** `.claude/settings.json` (committed to git) holds only placeholder values.
> `.claude/settings.local.json` (gitignored) holds your real credentials and overrides it locally.

### 3. Verify the Connection
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

**Trigger phrase:** Say _"deploy [workflow name] to prod"_ to start the flow.

---

## Database Work

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

### Security Standards
- **No secrets in workflow JSON** — use n8n's Credentials Manager exclusively for all secrets
- **Webhook security** — every webhook trigger must require authentication (Header Auth preferred)
- **Least privilege** — request only the OAuth scopes or API permissions the workflow actually needs
- **Payload validation** — add an IF node after webhook triggers to verify expected fields are present before processing
- **PII awareness** — avoid logging or storing personally identifiable information in execution data when possible
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
| Frontend/site implementation guidance or API usage | **`docs/site-implementation.md`** |
| How a backend system works (feature flags, auth, encryption, etc.) | **`docs/`** — relevant doc or new file |
| Build plans not yet started | **`.claude/plans/`** |
| Conventions, decisions, or context for future Claude sessions | **memory files** (`~/.claude/projects/.../memory/`) |
| Completed plan | Mark `**Status: IMPLEMENTED**` + date at top of the plan file |

**`OPEN_ITEMS.md` rules:** no duplicates; remove items immediately when resolved; add trailing tasks at end of each session without being asked.

---

## Requesting Missing Information
If Claude needs information to complete a workflow that was not provided, it should ask in a structured format:

> **To complete this workflow, I need:**
> - [ ] The name(s) of the n8n credentials to use for [service]
> - [ ] A sample payload or field list for the incoming data
> - [ ] Confirmation of the webhook path (suggested: `/your-path`)
> - [ ] Error handling preference (notify via [channel]? or silent fail?)

Do not proceed with placeholder values — ask and wait for confirmation.
