# New Sprint

A smart sprint planning skill. Acts like a senior technical partner — not just collecting requirements, but orienting across the full platform, synthesizing what it finds, making recommendations, and improving its own process each time it runs.

**Usage:** `/new-sprint` — full guided process  
**Usage:** `/new-sprint "<topic>"` — seed with a description  

Output: a committed plan file at `.claude/plans/<slug>.md`, OPEN_ITEMS updated, cross-repo impact noted, and a clear "ready now / blocked / needs cewall0" handoff.

---

## How This Works

Four phases. Orientation runs silently before any conversation. Gates 1–3 each end with a synthesis and recommendation — Claude waits for confirmation before proceeding. Nothing gets built until Gate 4.

```
Orientation  →  Silent platform scan across all repos + active plans
Gate 1       →  Understand the real goal (interview)
Gate 2       →  Full state audit + synthesis + integration review
Gate 3       →  Phase design + security + forward look
Gate 4       →  Write, audit, self-improve, commit
```

---

## Orientation — Platform State Snapshot

Run this silently before Gate 1. Don't narrate it — absorb it and use it to inform every subsequent gate.

### Repos to scan

Check all four repos in parallel:

| Repo | Path |
|---|---|
| `caiac-n8n-workflows` | (current) |
| `caiac-website` | `../caiac-website` |
| `caiac-client-dashboard` | `../caiac-client-dashboard` |
| `caiac-ops-dashboard` | `../caiac-ops-dashboard` |

For each: current git branch, whether it's clean, any active feature branches with recent commits.

### Active plans scan

Read every file in `.claude/plans/`. Classify each:
- **Active** — no `Status: IMPLEMENTED`, recently modified, or explicitly in progress
- **Implemented** — marked `Status: IMPLEMENTED`
- **Stale** — old, no clear status, likely abandoned

Build a mental map: what's in flight, what tables/workflows/repos each active plan touches, and what phase each is at. This map is referenced throughout Gates 2 and 3.

### n8n health check

Call `mcp__n8n__n8n_health_check`. If staging is unreachable, flag it — Gate 2 depends on live state.

### OPEN_ITEMS snapshot

Read `OPEN_ITEMS.md` in full. Hold in context — don't surface yet.

---

## Gate 1 — Understand the Real Goal

The goal is to understand *why*, not just *what*. Ask all of the following at once in a numbered list.

> **Before I pull live state, I want to make sure I understand what we're building:**
>
> 1. **What's the core problem?** What can't you do today that this sprint fixes? Walk me through the last time you hit it.
> 2. **Who uses this and at what role level?** Internal ops only, clients, or both?
> 3. **Which repos does it touch?** (n8n, ops-dashboard, client-dashboard, website)
> 4. **Is there a deadline or urgency?** What's driving it?
> 5. **What's the minimum version?** If you had to cut scope, what goes last?
> 6. **What must not change or break?** Any live workflows, DB tables, or user-facing behavior that's protected?

### Follow-up probes

Use the right ones based on answers — don't ask all of them.

**If Q1 is vague:** "Give me a specific action — what are you clicking through today, and where does it break down or take too long?"

**If Q3 spans all repos:** "What's the dependency chain? Can any part ship without the others, or does it all need to move together?"

**If Q5 reveals oversized scope:** "This looks like 2–3 sprints. Is there a slice that's independently useful — something that would already save time without the rest?"

**If Q6 is "nothing":** "Think about Full Auth, the reviews layer, and onboarding. Would any migration or path change here create even a brief inconsistency window for those?"

**If Orientation found an overlapping active plan:** "I noticed [Plan X] is active and touches [area]. Is this a continuation of that, a parallel track, or something separate? That affects how I'd structure the phases."

### Gate 1 close

Summarize scope in 4–5 bullets — including what's explicitly deferred. Note anything relevant from Orientation. Ask:

> "Here's my read: [bullets]. I also want to flag [Orientation observation]. Does my scope summary look right before I run the full audit?"

---

## Gate 2 — Full State Audit + Synthesis

**Claude does all of this. Don't ask the user to look anything up.**

Run 2a–2f in parallel. Do not narrate each step — synthesize into a single structured report at the end.

### 2a. Workflow inventory

Call `mcp__n8n__n8n_list_workflows` on staging. For every workflow the sprint will touch, call, modify, or replace:

- Exists in staging? Prod? Both?
- Active or inactive? Version?
- Local `workflows/*.json` present and current?
- Test file in `tests/workflows/`?
- Call graph: what does it call, what calls it?
- Correct `[Category]` bracket and platform tags?

Hard blockers: prod-only workflow → blocks safe testing. No test file → blocks prod deploy.

**Trigger type compatibility:** If any plan step calls a workflow via `executeWorkflow`, check the target workflow's trigger node. If it uses `chatTrigger` (not `executeWorkflowTrigger`), `executeWorkflow` will not fire it correctly — the AI agent's session management won't work and the call may silently fail. Flag immediately: the plan must be rewritten as a standalone webhook-triggered agent that reimplements the tools and system message in parallel, not a proxy call. This is a build-stopping incompatibility that must be caught in planning, not during execution.

### 2b. Live DB schema

For every table the sprint will read or write:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'caiac'
  AND table_name = ANY($1::text[])
ORDER BY table_name, ordinal_position;
```

If scope is unclear, pull the full table list first. **Never trust memory, docs, or prior sessions for column names.** If anything in a plan, memory file, or CLAUDE.md differs from the live result — flag it and correct it immediately. The standing example: `client_features.config` was written as `metadata` in every doc until a live query caught it after it had already propagated into three draft documents.

### 2c. Cross-repo impact

For each repo the sprint touches:
- Current branch, clean or dirty
- Any uncommitted work or open feature branches
- Whether sprint changes land on `dev` or require a feature branch
- Whether any new webhook path requires a corresponding CF Function update
- Whether any new n8n API and the CF Function calling it must ship simultaneously (coordinated deploy — must be explicit in the plan)

### 2d. OPEN_ITEMS — blocks and absorption

For each item in OPEN_ITEMS, answer two questions:

1. **Does it block this sprint?** Pending migration on a table we're touching, missing staging workflow needed for testing, unresolved prerequisite.
2. **Should it be absorbed?** If this sprint resolves the condition that was blocking the item, pulling it in is cleaner than leaving a deferred item with an undocumented dependency on this sprint's completion.

Hold absorption candidates for the synthesis — don't decide unilaterally.

### 2e. Active plans — sequence, conflict, and unification

Using the map from Orientation, check each active plan:

- **Conflict:** Same table, workflow, or component at the same time? What's the exact collision?
- **Sequencing:** Does one plan need to complete before this can start? Which direction?
- **Unification:** Is this actually a new phase of an existing plan rather than a standalone? Better to extend than create an undocumented dependency.
- **Future setup:** Does this sprint create something (a table, pattern, fixture) that an active plan will need? Make that design decision explicit — it becomes load-bearing.

### 2f. Cohesion and platform standards

**New billable feature — mandatory 4-step checklist (CLAUDE.md):**
If the sprint introduces any feature gated behind `client_features`, all four must be in the plan:
1. `[Admin] Toggle Client Feature v1.0.0` — add key to `KNOWN_FEATURES`
2. `[Onboarding] Seed Client Features v1.0.0` — add default `enabled` row
3. Backfill migration — insert feature row for all existing active clients
4. Feature guard in the new workflow (see `docs/roles-and-features.md`)

Missing any one breaks the system for existing clients. If the sprint implies a new billable feature but the design doesn't show all four, flag immediately.

**Naming and structure:**
- Workflow names: `[Category] Short Action Description vX.X.X`
- Webhook paths: `/{client-slug}/{action}`, lowercase kebab-case — no uppercase, no underscores
- Node names: Verb + Object, sentence case — no defaults like `HTTP Request1`
- Tags: at least one platform tag; multi-tag where workflow spans categories

**Required elements in every new workflow:** Sticky Note (purpose, trigger, gotchas), error handling (see security checklist — inline pattern for webhooks, Error Trigger only for non-webhook triggers), descriptive node names, at least one tag.

**Template rule:** Every client-facing workflow must be parameterized by `client_id` or `slug` — never hardcoded to a specific client.

**Call graph:** Where does each new workflow fit? What calls it, what does it call? These go in `workflows/README.md`.

**Credential parity:** For every credential the sprint needs — exists on staging under what name? Same name on prod? Names must be identical between environments. Flag any missing prod credentials as a cewall0 task now, not during execution.

### 2g. Synthesis — findings + recommendation

Present the structured audit report. Then make a recommendation — don't just list findings and ask what to do. Synthesize and state what you think the right approach is, with the tradeoff explicit.

```
PLATFORM STATE — [sprint topic] (YYYY-MM-DD)

Workflows
  ✅ [Utility] Full Auth v2.0.0 — prod + staging, active, file current, test exists
  ⚠️  [Reviews] Handle Rating Click — prod only, no staging, no test (BLOCKS Phase 0)
  ❌ [Admin] Get Feature Config v1.0.0 — doesn't exist yet (new build)

DB Schema (live-verified YYYY-MM-DD)
  client_features: id, client_id, feature, enabled, config JSONB ← confirmed
  [table]: [relevant columns]

Repos
  caiac-ops-dashboard: on dev, clean — safe to branch from
  ⚠️  caiac-client-dashboard: uncommitted changes on feature/chat-ui — coordinate before merging

OPEN_ITEMS
  Block: "Handle Rating Click staging version" — must exist before Phase 0 testing
  Absorb candidate: "DB migration Step 3" — same table, timing aligns

Active Plans
  ⚠️  lead-data-architecture.md (Phase 3 pending) — also touches caiac.leads
    Conflict: both plans add columns to the same table
    Recommendation: merge Phase 0 migrations into one coordinated pass

New Billable Feature Checklist
  ✅ Toggle / Seed / Backfill all present in design
  ⚠️  Feature guard missing — must add before Gate 3

Credentials
  ⚠️  "Resend Email" — staging ✅, prod ❌ — cewall0 must create before prod deploy

Cohesion
  ⚠️  Webhook path `/admin/getConfig` → should be `/admin/get-config`
  ⚠️  Two new workflows span admin + rag — both need both tags
```

Then:

> **Recommendation:** [e.g. "Merge Phase 0 with lead-data-architecture Phase 3 — they touch the same table and running two separate migration passes in the same week is higher risk than one coordinated pass. Pull the Step 3 OPEN_ITEM in at the same time."]
>
> **Tradeoff:** [e.g. "This couples the two sprints' Phase 0s. If lead-data-arch Phase 3 gets delayed, so does this. Given it's a small SQL step, I think that's worth it."]
>
> **Decisions I need from you:**
> - [Genuine choice, e.g. "Handle Rating Click has no staging version. Do you want that as a prerequisite step in this sprint, or tracked separately in OPEN_ITEMS?"]

---

## Gate 3 — Phase Design, Security, and Forward Look

### Phase design rules

**Separation:** One kind of work per phase.
- DB migrations always first
- Bug fixes / existing workflow updates before new builds
- Phase T (test infrastructure) inserted before the first phase that needs it
- Frontend after the n8n APIs it calls are tested in staging

**Phase T is required when:**
- A repo doesn't have Playwright installed
- A new HMAC sign helper, analytics fixture, or seed test client is needed
- A nightly cleanup node needs to be added for test data

**Breaking-change windows:** Any step where two parts are briefly inconsistent (column rename, webhook path change, schema drop) gets its own step, marked `⚠️ Off-hours`, with an explicit "deploy companion workflow immediately after SQL" instruction.

### Security — per new or modified webhook

| Check | Pass condition |
|---|---|
| Auth | Header Auth preferred; Basic Auth requires documented reason |
| SQL | All user input through `$1`/`$2` params — never string interpolation |
| Secrets | Credential Manager names only in workflow JSON |
| PII | `saveDataSuccessExecution: "none"` + `docs/pii-and-compliance.md` entry if workflow handles names/emails/phones/addresses |
| Payload validation | IF node immediately after webhook trigger, checks required fields before processing |
| Feature guard | Present and reads from DB for any billable feature |
| Signing secrets | Never in browser traffic — signing happens server-side only |
| Least privilege | Scopes limited to what the workflow actually uses |
| Error handling (webhooks) | **Must use inline pattern:** `onError: continueRegularOutput` on the Webhook Trigger + IF node for auth + Respond 4xx inline. **Do NOT use** `Error Trigger → respondToWebhook` — Error Trigger fires in a separate execution context and cannot respond to the original HTTP request; the caller gets a 200 empty body on any unexpected error. |

Any failed check must have a fix step added to the correct phase. Do not close Gate 3 with open security findings.

### Test coverage

For each new or modified webhook:
- Valid request shape and expected response
- The two most likely bad requests from a real caller
- DB side effect to assert on (not just HTTP response shape)
- Any fixture, seed client, or cleanup needed → goes in Phase T

For each frontend component:
- Loading state, empty state, error state — which need Playwright assertions?

### Forward look

After drafting phases, ask these before writing steps:

> **A few forward-looking questions:**
>
> 1. **What does the next sprint need that this one could set up cheaply?** A reusable fixture, a call graph pattern, a nearby migration.
> 2. **Are any decisions here hard to undo?** Column names, webhook paths, feature key names become load-bearing once clients use them.
> 3. **Does this sprint create new deferred work?** If yes, it goes in OPEN_ITEMS before the plan is committed — not after.
> 4. **Does anything here make an active plan harder to execute?** Schema decisions that complicate a future migration, paths that conflict with a planned refactor.

Add a **Future Setup** section to the plan for anything worth preserving. Add OPEN_ITEMS entries for new deferred work discovered here.

### Gate 3 close

Present the full phase table, security checklist, and forward-look findings together. Then:

> "Phase structure and security look solid. Key risks:
> - Highest-risk step: [step] — rollback: [how]
> - Off-hours window: [step + what deploys immediately after]
> - Forward note: [anything from forward look worth flagging]
>
> Confirm and I'll write the plan."

---

## Gate 4 — Write, Audit, Self-Improve, Commit

### 4a. Consistency subagent

Before writing, spawn a subagent with the full draft plan and the live DB schema from Gate 2:

> "Audit this sprint plan for correctness and consistency. Check:
> 1. Column names — compare every SQL reference against the live schema. Flag any mismatch, even one character.
> 2. Workflow names and IDs — compare against `workflows/README.md`. Flag any that don't match exactly.
> 3. SQL blocks — flag any that use string interpolation instead of `$1`/`$2` params.
> 4. Phase prerequisites — every step depending on an earlier one must have that dependency present and ordered correctly.
> 5. Test coverage — every referenced test file must be described with what it covers and what fixture it needs.
> 6. Security checklist — every ⚠️ must have a corresponding fix step in some phase.
> 7. New billable feature checklist — if a feature-gated workflow is in scope, all four steps must be present.
> 8. Workflow required elements — Sticky Note, error handling, and tags listed in every new workflow's build step.
> 9. Credential parity — every credential noted as existing on both environments, or flagged with a cewall0 owner.
> 10. Cross-repo coordination — every CF Function change that must ship with an n8n change is noted as a coordinated deploy.
> Return a numbered list. Quote the exact text that's wrong. If nothing is wrong, say so explicitly."

Fix every finding. If the subagent catches something a gate should have caught, note it for 4d.

### 4b. DB schema snapshots

For every `ALTER TABLE` in the plan, insert a step immediately before it:

> Step N.0 — Snapshot `<table>` to `docs/db-snapshots/<table>-pre-<description>.md`

The snapshot includes: current column list, current constraints, the migration SQL about to run, and rollback SQL. Required by CLAUDE.md — same discipline as the workflow pre-update snapshot commit.

### 4c. Write the plan file

**File:** `.claude/plans/<kebab-case-title>.md`

```markdown
# [Sprint Title]

**Status: PLANNING**
**Started:** YYYY-MM-DD

## Goal
[One paragraph — core problem and how this sprint solves it]

## Scope
- **Repos:** [list]
- **Tables modified:** [table — migration type]
- **Workflows modified:** [name — change, new version]
- **Workflows created:** [name — what it does, call graph position]
- **Frontend components:** [name — repo]
- **New billable features:** [feature key — default enabled state]
- **Absorbed from OPEN_ITEMS:** [item — why absorbed here]
- **Deferred / out of scope:** [list — brief reason each]

## Active Plan Dependencies
[Other in-flight plans this sprint must sequence around, and why]

## Phase Overview
| Phase | Name | Type | Notes |
|---|---|---|---|
| 0 | DB Migrations | Sequential | ⚠️ Step N off-hours |
| 1 | [Name] | Independent | Pre-flight query required |
| T | Test Infrastructure | Autonomous | Needs user input for: [list] |
| 2 | New Workflows | Sequential per workflow | Test file before each prod deploy |
| 3 | [Frontend] | After Phase 2 | Playwright E2E per component |

## Pre-flight Queries
[SQL for every phase gate check, labeled by phase]

## Build Order

### Phase 0 — DB Migrations
[Numbered steps. Schema snapshot step before every ALTER TABLE. SQL includes rollback SQL inline. Workflow deploy steps include staging ID and the exact change.]

### Phase T — Test Infrastructure
[T1–TN. Each step marked: "Claude autonomous" or "needs: [user input]".]

### Phase 2+ — [Name]
[Each workflow step ends with:
  → test file: tests/workflows/<name>.test.ts
  → covers: auth rejection, [specific happy path], DB assertion on [table.column]]

## Security Checklist
| Check | Status | Notes |
|---|---|---|
| Webhook auth | ✅ / ⚠️ | — |
| SQL parameterization | ✅ / ⚠️ | — |
| No secrets in workflow JSON | ✅ | — |
| PII — saveDataSuccessExecution | ✅ / ⚠️ Phase N | — |
| Payload validation | ✅ | — |
| Feature guards | ✅ / N/A | — |
| Signing secrets server-side | ✅ / N/A | — |
| Least privilege | ✅ | — |

## New Billable Feature Checklist
[Only if sprint introduces a feature-gated workflow]
| Step | Phase + Step |
|---|---|
| Toggle Feature — add to KNOWN_FEATURES | Phase N, Step N |
| Seed Features — add default row | Phase N, Step N |
| Backfill migration (existing clients) | Phase N, Step N |
| Feature guard in workflow | Phase N, Step N |

## Test Coverage
| Workflow / Component | Test file | Covers | Needs fixture? |
|---|---|---|---|
| [Name] | tests/workflows/name.test.ts | Auth rejection, happy path, DB assertion | — |

## Call Graph Changes
[New Calls / Called-by relationships to add to workflows/README.md when plan executes]

## Credential Requirements
| Credential | Staging | Prod | Owner if missing |
|---|---|---|---|
| [Name] | ✅ | ✅ | — |
| [Name] | ✅ | ❌ | cewall0 |

## Future Setup
[Things this sprint sets up that future sprints will benefit from — patterns, infrastructure, fixtures, conventions established]

## Known Risks
[Timing-sensitive steps, blast radius, what silent failure looks like, rollback path per phase]

## Requires cewall0
[DB superuser access, GitHub secrets, Cloudflare config, OAuth reconnect, branch protection]
```

### 4d. Documentation routing

Route any discovery that doesn't belong in the plan file:

| What it is | Where it goes |
|---|---|
| New system behavior or architecture decision | `docs/` — relevant existing file or new one |
| Convention or gotcha worth preserving across sessions | Memory file in `~/.claude/projects/.../memory/` |
| Deferred work or genuine blocker | `OPEN_ITEMS.md` |
| Completed existing plan | Mark `**Status: IMPLEMENTED**` + date |

### 4e. Self-improvement — update this skill

After the subagent audit, review what the planning process missed or handled awkwardly:

- Did the subagent catch something a gate should have caught? Which gate, what check?
- Did a security issue surface that isn't in the Gate 3 security checklist?
- Did a cross-repo problem emerge late that Gate 2 should have caught?
- Did the forward-look questions reveal a recurring pattern worth baking in?
- Did the user correct a question that was poorly framed?

If any of these are true, **update this skill file** before committing — add or sharpen the relevant check in the relevant gate. Then append an entry to the `## Learned Patterns` section at the bottom with what changed and why.

The skill gets sharper with each sprint — not by accumulating length, but by replacing weak checks with precise ones.

### 4f. Commit

Stage the plan file, any OPEN_ITEMS changes, any new/updated docs, and any changes to this skill file:

```
feat: add sprint plan — <title>
```

If this skill was updated, note it in the commit message body.

### 4g. Handoff

> "Plan committed to `.claude/plans/<name>.md`.
>
> **Ready to run now:**
> - [Phase] — [what to run first, what pre-flight query to run]
>
> **Blocked:**
> - [Phase] — [blocker + where it's tracked]
>
> **Needs cewall0:**
> - [list]
>
> **Forward notes:**
> - [anything from Future Setup worth flagging now]
>
> To execute: [relevant skill command or 'tell me which phase to kick off']."

---

## Key Rules

- **Never build during planning.** The only outputs before Gate 4 are questions, audit findings, and a plan file.
- **Always query the live DB schema.** Memory and docs go stale. The DB doesn't.
- **Synthesize, don't just report.** At each gate, make a recommendation with the tradeoff explicit. Don't hand options back without a point of view.
- **OPEN_ITEMS is an absorption opportunity, not just a blocker list.** An item that overlaps with this sprint is usually better resolved here.
- **Active plans are part of the design space.** A conflict needs an explicit sequencing decision, not just a note that overlap exists.
- **New billable features are a hard gate.** All four checklist steps must be in the plan. Missing one breaks existing clients.
- **Security failures block the gate.** A finding only in the checklist without a fix step in a phase will not get fixed.
- **Schema snapshots before every ALTER TABLE.** No exceptions.
- **Credential parity confirmed in Gate 2.** A missing prod credential found during execution is a blocked deploy. Find it in planning.
- **The forward look is not optional.** Planning that doesn't ask "what does this make harder later?" creates the OPEN_ITEMS of the next sprint.
- **This skill improves itself.** Every time the subagent catches something a gate should have caught — update that gate. The skill gets sharper with every sprint, not static.

---

## Learned Patterns

*Updated by this skill during Gate 4e. Each entry records what was missed, where it should have been caught, and what rule or check was added or sharpened as a result.*

- **2026-06-28:** `client_features` JSONB column is `config`, not `metadata`. A live query caught it after it propagated into three plan drafts and several memory files. Added to Gate 2b: flag every mismatch between any prior source and the live query result — never assume the doc is right.

- **2026-07-01:** Plan said step 1.3 would call the onboarding AI agent via `executeWorkflow`. The agent uses `chatTrigger` — incompatible with `executeWorkflow`. Only caught during build; required a full standalone reimplementation (21 nodes, 9 tools). Added to Gate 2a: check trigger type of any workflow targeted by `executeWorkflow` — `chatTrigger` target = standalone webhook agent required, not a proxy call.

- **2026-07-01:** Gate 3 security checklist listed "Error Trigger node or IF try/catch" as valid options for error handling. `Error Trigger → respondToWebhook` is structurally broken on webhook-triggered workflows (separate execution context, cannot respond to the original request — returns 200 empty body on failure). Correct pattern: `onError: continueRegularOutput` on webhook trigger + inline IF + Respond 4xx. Updated security checklist row and Required Elements note in Gate 2f.
