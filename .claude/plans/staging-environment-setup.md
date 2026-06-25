# Staging Environment Setup + Deployment Strategy

**Status: PLANNED**
**Owner: cewall0 (DB + Cloudflare infra) + lukesgray (n8n + frontend wiring)**
**Priority: Before first paying client**

---

## Goal

Fully decouple staging from prod so that:
- DB migrations can be tested on staging data before touching prod
- Staging workflow builds can't corrupt real client data
- A clear, repeatable procedure exists for shipping features from dev → staging → prod

---

## Current State

| Layer | Staging | Prod |
|---|---|---|
| n8n | `flows-staging.caiacdigital.com` | `flows.caiacdigital.com` |
| Database | **Same prod DB** ← problem | `caiac` schema on VPS Postgres |
| Cloudflare | Unknown / not formally set up | `caiac-website`, dashboards on `main` |
| Source of truth | `dev` branch | `main` branch |

---

## Target State

| Layer | Staging | Prod |
|---|---|---|
| n8n | `flows-staging.caiacdigital.com` → staging DB | `flows.caiacdigital.com` → prod DB |
| Database | `caiac_staging` database on same VPS Postgres | `caiac` database (unchanged) |
| Cloudflare | `dev` branch → preview deployments → staging n8n | `main` branch → production deployments → prod n8n |
| Source of truth | `dev` branch | `main` branch |

**Key insight:** The staging n8n's `CAIAC Postgres` credential just points at a different database. All workflow SQL (`caiac.table_name`) works unchanged because the new DB has the same `caiac` schema name inside it. One credential update covers every workflow.

---

## Phase 1: Staging Database (cewall0)

**What:** Create a separate Postgres database called `caiac_staging` on the same VPS. It gets a `caiac` schema inside it — identical structure to prod, empty data.

**Why same schema name:** All n8n workflows already use fully-qualified `caiac.table_name` SQL. If the schema inside the new DB is also called `caiac`, zero workflow SQL changes are needed.

### Steps

```sql
-- 1. Create the staging database
CREATE DATABASE caiac_staging;

-- 2. Connect to it and create the schema
\c caiac_staging
CREATE SCHEMA caiac;

-- 3. Create all tables (run full DDL — see below)
-- Use: pg_dump --schema-only --schema=caiac caiac | psql caiac_staging
-- This copies the table/index/constraint structure without data.

-- 4. Enable pgcrypto (needed by CRM Create Lead)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 5. Create a Postgres user scoped to staging (optional but good practice)
CREATE USER caiac_staging_user WITH PASSWORD '<staging-password>';
GRANT USAGE ON SCHEMA caiac TO caiac_staging_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA caiac TO caiac_staging_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA caiac GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO caiac_staging_user;
```

### Seed staging DB

After structure is in place, seed the minimum data needed for n8n workflows to function:

```sql
-- CAIAC self-client row (so Lead Capture works in staging)
INSERT INTO caiac.clients (id, slug, name, vertical, active, config, webhook_secret)
VALUES (
  gen_random_uuid(), 'caiac', 'CAIAC Digital', 'agency', true,
  '{"lead_capture": {"notify_email": "caiacgroup@gmail.com", "from_name": "CAIAC Digital", "from_email": "caiacgroup@gmail.com", "field_map": {"Full Name": "name", "Email Address": "email", "Phone Number": "phone", "Service Needed": "service", "Main Challenge": "challenge", "How Did You Hear About Us": "how_heard", "Business Name": "business_name", "Business Type": "business_type"}}}'::jsonb,
  '<staging-webhook-secret>'
);

-- Feature flags for CAIAC staging client
INSERT INTO caiac.client_features (client_id, feature, enabled)
SELECT id, feat, true FROM caiac.clients, unnest(ARRAY['chat','reviews','intake','lead_scoring']) AS feat
WHERE slug = 'caiac';
```

### Set staging n8n env vars (cewall0 sets in n8n instance config)

```
CAIAC_ENCRYPTION_KEY=<staging-specific-key, different from prod>
CAIAC_ADMIN_KEY=<same or different from prod, used by Get DB Schema workflow>
```

---

## Phase 2: Point Staging n8n at Staging DB

**One change. One credential update. All workflows automatically follow.**

### Steps (cewall0 or Luke — n8n UI or MCP)

1. Go to staging n8n UI → **Settings → Credentials**
2. Open **`CAIAC Postgres`** (credential ID: `oJ321kQrsEmHydiQ`)
3. Change the **Database** field from `caiac` → `caiac_staging`
4. Update the user/password if you created a `caiac_staging_user`
5. Save

That's it. Every workflow in staging now reads/writes the staging DB.

> **Why this works:** All workflow nodes reference credentials by ID, not by connection string. Changing the credential's target database updates every workflow that uses it simultaneously.

### Verify

Run the schema tool to confirm it's pointing at the right place:
```bash
curl "https://flows-staging.caiacdigital.com/webhook/admin/db-schema?table=clients" \
  -H "x-admin-key: <CAIAC_ADMIN_KEY>"
# Should return columns but zero rows for client-count
```

Or trigger a test onboarding run and confirm a new row appears in `caiac_staging.caiac.clients`, not `caiac.caiac.clients`.

---

## Phase 3: Cloudflare Staging Environments

Each of the three frontend repos needs to know whether to talk to staging n8n or prod n8n. This is controlled by the `N8N_WEBHOOK_BASE` environment variable.

### Cloudflare Pages (client-dashboard + ops-dashboard)

In each project's Cloudflare Pages settings → **Environment variables**:

| Environment | Variable | Value |
|---|---|---|
| Production | `N8N_WEBHOOK_BASE` | `https://flows.caiacdigital.com` |
| Preview | `N8N_WEBHOOK_BASE` | `https://flows-staging.caiacdigital.com` |

**How this works:** Cloudflare Pages automatically deploys `main` branch pushes to Production and all other branches (including `dev`) to Preview. The Preview deployment gets the staging n8n URL. No code changes needed.

**Custom staging domain (optional):** If you want `staging.dashboard.caiacdigital.com` instead of the auto-generated `.pages.dev` URL, add a custom domain in the Pages project settings under the Preview environment.

### Cloudflare Workers (caiac-website)

In `wrangler.toml`, define environments:

```toml
[env.staging]
name = "caiac-website-staging"
vars = { N8N_WEBHOOK_BASE = "https://flows-staging.caiacdigital.com" }

[env.production]
name = "caiac-website"
vars = { N8N_WEBHOOK_BASE = "https://flows.caiacdigital.com" }
```

Deploy staging with: `wrangler deploy --env staging`
Deploy prod with: `wrangler deploy --env production`

(Or let GitHub Actions handle this — see Phase 4.)

### GitHub Actions / CI (cewall0 sets secrets)

Each repo needs these GitHub Secrets (Settings → Secrets → Actions):

| Secret | Notes |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Needs Workers + Pages deploy permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Found in Cloudflare dashboard |

The workflow files in each repo should already trigger on push to `dev` (staging deploy) and push to `main` (prod deploy). If they don't exist yet, they need to be created.

---

## Phase 4: Deployment Procedures

### Standard Feature Flow

```
feat/my-feature (branch off dev)
    ↓ build + test locally
dev branch
    ↓ push → staging auto-deploys (Cloudflare)
    ↓ build n8n workflows in staging (MCP staging tools)
    ↓ test end-to-end against staging DB + staging Cloudflare
    ↓ export n8n JSON → commit to dev
PR: dev → main (review + approval)
    ↓ merge
main branch
    ↓ Cloudflare prod auto-deploys
    ↓ Deploy n8n workflows to prod (MCP prod tools, confirmed)
    ↓ Sync prod n8n JSON files → commit to main
```

### DB Migration Procedure

When a feature requires schema changes:

**Staging:**
1. Snapshot current staging schema: `curl .../admin/db-schema?table=<name>` → save to `docs/db-snapshots/`
2. Run migration SQL on staging DB (cewall0 via psql)
3. Deploy workflow that uses new schema to staging n8n
4. Test end-to-end in staging

**Prod (after staging verified):**
5. Snapshot current prod schema (same tool, different URL once deployed to prod, or cewall0 runs psql directly)
6. Commit snapshot as `"snapshot: <table> before <migration>"` — the rollback point
7. cewall0 runs migration SQL on prod DB
8. Deploy workflow to prod n8n (confirmed)
9. Commit prod JSON as `"sync: <workflow> v<version>"`

**Rollback:** `git show HEAD~1:workflows/<file>.json` → re-deploy that JSON → cewall0 reverses migration SQL from snapshot doc.

### n8n Workflow Deploy Checklist

Before deploying any workflow to prod:
- [ ] Tested in staging (activated, real request sent, execution checked)
- [ ] Credential names match between staging and prod (mismatch = silent failure on prod)
- [ ] Feature flag added to seed + toggle workflows (if billable feature)
- [ ] `workflows/` JSON snapshotted from current prod (`"snapshot: before update"` commit)
- [ ] User confirmed prod deploy is approved
- [ ] Activation on prod is a separate explicit step — never auto-activate

### Release Coordination (when n8n + DB + Cloudflare all change together)

For cross-layer features (e.g., Lead Capture v2.1.0 — new DB columns + new workflow + frontend change):

1. DB migration on staging → test workflow → test Cloudflare integration
2. Merge `dev` → `main` (triggers Cloudflare prod deploy) — **deploy frontend last**
3. cewall0 runs DB migration on prod
4. Deploy n8n workflow to prod (MCP, confirmed)
5. Verify Cloudflare prod is hitting the new workflow correctly
6. Activate workflow on prod

> **Why frontend last:** Cloudflare deploys on merge are instant. If the new workflow isn't on prod yet when the frontend deploys, the old workflow handles the new frontend's requests gracefully (they're backward compatible). The window is short. If they're not backward compatible, coordinate the exact order.

---

## What Stays the Same

- All `caiac.table_name` SQL in workflows — no changes
- Workflow JSON structure — identical between staging and prod
- n8n credential names — must stay identical (CRM Create Lead depends on this)
- `workflows/` directory — still only prod-deployed JSON files
- CAIAC Sheets credential — shared, same Google account in both environments (acceptable — Sheet data isn't production-sensitive)

---

## Open Questions for cewall0

1. **Same VPS Postgres or new instance?** Recommendation: same VPS, new database. Lower overhead, easy to set up with `pg_dump --schema-only`.
2. **Staging Postgres user?** Recommendation: yes, separate `caiac_staging_user` with limited permissions. Prevents accidental prod writes from staging.
3. **`CAIAC_ENCRYPTION_KEY` for staging?** Should be different from prod. Generate a new 64-char hex key.
4. **Cloudflare Pages custom staging domain?** Nice to have — e.g., `staging.dashboard.caiacdigital.com`. Not required to start.
5. **When do we do this?** Before first paying client lands — so the first real client data never touches a shared staging/prod DB.
