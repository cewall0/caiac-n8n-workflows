# n8n Workflow Builder

## Overview
This project directory stores and manages n8n workflows for a self-hosted n8n instance. Claude uses the n8n MCP server to directly create, update, and manage workflows in the live n8n instance.

Primary workflow types: **automations & integrations**, **webhooks & API workflows**.

---

## Setup (First-Time Checklist)

### 1. Get Your n8n API Key
1. Open your n8n instance (e.g., `http://localhost:5678`)
2. Go to **Settings → n8n API**
3. Click **Create an API key**, give it a name, and copy the key

### 2. Configure the n8n MCP Server in Claude Code
Real credentials go in **`.claude/settings.local.json`** (gitignored — never committed to GitHub).
A template is already created at `.claude/settings.local.json`. Fill in your actual values:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "env": {
        "N8N_BASE_URL": "http://YOUR_ACTUAL_HOST:5678",
        "N8N_API_KEY": "your-actual-api-key-here"
      }
    }
  }
}
```

> **Note:** `.claude/settings.json` (committed to git) holds only placeholder values.
> `.claude/settings.local.json` (gitignored) holds your real credentials and overrides it locally.

### 3. Verify the Connection
Ask Claude: _"List my n8n workflows"_ — if the MCP server is working, Claude will return your existing workflows.

---

## Available MCP Tools
Claude uses these tools via the n8n MCP server to interact with your instance:

| Tool | Purpose |
|------|---------|
| `n8n_list_workflows` | List all workflows |
| `n8n_get_workflow` | Read a workflow by ID |
| `n8n_create_workflow` | Create a new workflow |
| `n8n_update_workflow` | Update an existing workflow |
| `n8n_activate_workflow` | Activate a workflow |
| `n8n_deactivate_workflow` | Deactivate a workflow |
| `n8n_execute_workflow` | Trigger a manual execution |
| `n8n_list_executions` | Check recent execution history |
| `n8n_get_execution` | Get details of a specific execution |

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

## Requesting Missing Information
If Claude needs information to complete a workflow that was not provided, it should ask in a structured format:

> **To complete this workflow, I need:**
> - [ ] The name(s) of the n8n credentials to use for [service]
> - [ ] A sample payload or field list for the incoming data
> - [ ] Confirmation of the webhook path (suggested: `/your-path`)
> - [ ] Error handling preference (notify via [channel]? or silent fail?)

Do not proceed with placeholder values — ask and wait for confirmation.
