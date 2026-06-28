# New Sprint

Guided discovery process for planning a new sprint. Works like a technical interview — Claude asks questions, audits live state, challenges assumptions, and doesn't write the plan until the design is stress-tested and the security is solid.

**Usage:** `/new-sprint` — start from scratch  
**Usage:** `/new-sprint "<topic>"` — start with a seed description (e.g. `/new-sprint "admin config panel"`)

Output: a committed plan file at `.claude/plans/<slug>.md`, any OPEN_ITEMS blockers surfaced, and a clear "what's ready to run now" summary.

---

## How This Works

Five gates. Each gate ends with a question or confirmation — Claude waits for your answer before moving on. No code, no workflows, no commits until Gate 5.

```
Gate 1 → Understand the real goal
Gate 2 → Audit live state (no assumptions)
Gate 3 → Design and pressure-test the phases
Gate 4 → Security + test coverage review
Gate 5 → Finalize, audit, commit
```

---

## Gate 1 — Understand the Real Goal

Start here, regardless of how much detail was given upfront. The goal of this gate is to understand *why* this is being built, not just *what*.

### Opening question set

Ask all of these at once in a numbered list. Do not ask them one at a time.

> **Before I start pulling live state, I want to make sure I understand what we're building. A few questions:**
>
> 1. **What's the core problem?** What can't you do today that this sprint fixes?
> 2. **Who uses this?** (internal ops only, clients, both — and what role level?)
> 3. **Which repos does it touch?** (n8n, ops-dashboard, client-dashboard, website, or some combination)
> 4. **Is there a deadline or urgency?** If so, what's driving it?
> 5. **What would a minimal version look like?** If we had to cut scope, what's the last thing to go?
> 6. **Anything that's explicitly out of scope or must not change?**

### Follow-up probes (use based on answers)

If the answer to Q1 is vague ("I want a dashboard for managing clients"): 
> "What's the specific action you can't do today? Walk me through the last time you hit the limitation."

If the answer to Q3 spans all repos:
> "Is there a natural sequencing — like, does the n8n side have to exist before the dashboard can be built? Which part is the blocker for the others?"

If Q5 reveals a very large scope:
> "This sounds like it could be 2–3 separate sprints. Is there a version of this that's independently useful and could ship first? What would that look like?"

If Q6 is "nothing":
> "Think about the workflows that are live right now — `[Utility] Full Auth`, the reviews layer, onboarding. Would any of this sprint's changes affect their behavior even briefly?"

### Gate 1 close

Produce a **scope summary** (3–5 bullet points) and ask:

> "Here's my read on the scope:
> - Goal: [one sentence]
> - Users: [who]
> - Repos: [list]
> - Must-have: [core features]
> - Out of scope / nice-to-have: [deferred items]
>
> Is this right? Anything I misread or missed?"

Do not proceed until confirmed.

---

## Gate 2 — Audit Live State

**Claude does all of this. Do not ask the user to look anything up.**

Run all checks in parallel where possible. Summarize findings at the end — don't narrate each step as you go.

### 2a. Workflow inventory

Call `mcp__n8n__n8n_list_workflows` on staging. For every workflow the sprint will touch or call:
- Does it exist in staging? Prod? Both?
- Is it active?
- What version?
- Does a `workflows/*.json` file exist for it?
- Does it have a test file in `tests/workflows/`?

Surface gaps (e.g. "exists in prod but no staging version — this blocks testing").

### 2b. Live DB schema — required for any sprint touching the DB

For every table in scope, run via temp workflow:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'caiac'
  AND table_name = ANY($1::text[])
ORDER BY table_name, ordinal_position;
```

**Rule: never trust memory or docs for column names. The DB is the truth.** If a column name in a prior plan, memory file, or CLAUDE.md differs from what the live query returns — flag it explicitly and correct it before designing any SQL.

If scope is unclear, also pull the full table list:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'caiac' ORDER BY table_name;
```

### 2c. Scan OPEN_ITEMS.md

Read the full file. Flag anything that:
- Blocks a workflow this sprint will touch
- Is a pending migration on a table this sprint will use
- Is a pending deactivation of a workflow this sprint calls

### 2d. Check `.claude/plans/` for related plans

If a related plan exists (partial, old, or complete), surface it. Don't duplicate work or conflict with an existing plan that's still in flight.

### 2e. Audit findings summary

After all checks, present a structured summary:

```
AUDIT FINDINGS

Workflows
  ✅ [Utility] Full Auth v2.0.0 — prod + staging, active, local file current
  ⚠️  [Reviews] Handle Rating Click v1.0.0 — prod only, no staging version (BLOCKS testing)
  ❌ [Admin] Get Client Config v2.0.0 — doesn't exist yet (needs to be built)

DB Schema  (live, verified)
  client_platform_config: [column list]
  client_features: config JSONB (not metadata — verified)

OPEN_ITEMS conflicts
  "Handle Rating Click staging version needed" — overlaps with this sprint

Existing plans
  None related
```

Then ask:

> "Here's what I found. A few things to flag before we design phases:
> - [specific concern 1 — e.g. "Handle Rating Click has no staging version, which means we can't safely test the migration that touches it. Do you want to unblock that first or design around it?"]
> - [specific concern 2]
>
> Do any of these change the scope or priority?"

---

## Gate 3 — Phase Design + Pressure Test

### Draft the phases

Using the scope from Gate 1 and the audit from Gate 2, draft a phase breakdown. Apply these rules:

**Separation rules:**
- DB migrations → their own phase (always first)
- Workflow bug fixes / existing workflow updates → their own phase (can run before new builds)
- New workflow builds → their own phase (after any migrations they depend on)
- Frontend → after the n8n workflows it calls are live
- Test infrastructure (Playwright install, new fixtures, seed clients) → Phase T, inserted before the first phase that needs it

**Phase T rule:** If any of these are true, Phase T is required:
- A repo doesn't have Playwright installed yet
- A new HMAC sign helper, analytics fixture, or seed client is needed for tests
- A nightly cleanup node needs to be added

**Breaking-change window rule:** Any operation that creates a gap where two workflows are temporarily inconsistent (column rename, path change, schema drop) must be isolated in its own step with an explicit `⚠️ Off-hours` marker and a "deploy the workflow fix immediately after the SQL" note.

### Present the phase table

```
Phase 0   DB Migrations           Sequential. ⚠️ Step 2 off-hours (column rename).
Phase 1   Fix Existing Workflows  Independent. Pre-flight DB query required first.
Phase T   Test Infrastructure     All steps autonomous except [exceptions].
Phase 2   New n8n Workflows       9 workflows. One test file per webhook before prod deploy.
Phase 3   Ops Dashboard           Playwright E2E per component.
Phase 4   Client Dashboard        Playwright E2E.
```

### Pressure-test questions

Ask these — don't skip them just because the design looks clean.

> **Before I write out the full steps, I want to stress-test the design:**
>
> 1. **What breaks if Phase [X] is deployed but Phase [Y] hasn't run yet?** Walk me through the failure mode. Is it silent (wrong data) or loud (500 error)?
> 2. **Is there a phase here that could ship independently and provide value earlier?** Or are they all truly coupled?
> 3. **Who's the first person affected if something goes wrong during the breaking-change window?** What's the blast radius?
> 4. **Are there any existing clients whose data would be affected by the migrations?** (Not just schema structure — actual data in the rows.)
> 5. **Is there anything in this plan that requires cewall0's involvement?** (DB access, GitHub secrets, OAuth reconnect, branch protection)

Follow up on any answer that reveals a risk that isn't accounted for in the phase structure. Adjust phases if needed.

### Gate 3 close

> "Phase design looks solid. Here's what I'm flagging as the highest-risk step: [step]. Here's the plan if that step fails mid-execution: [rollback path].
>
> Confirm this phase structure and I'll move to security + test coverage."

---

## Gate 4 — Security + Test Coverage

### 4a. Security interview (per new or modified webhook)

For each webhook in scope, ask or verify:

| Check | Question |
|---|---|
| **Auth** | What auth method? (Header Auth preferred — why Basic Auth if used?) |
| **SQL** | Are there any user-supplied values going into a Postgres node? If yes, are they `$1` params or string interpolation? |
| **Secrets** | Any credential or secret that needs to exist in n8n Credentials Manager — does it already exist with the right name on both staging and prod? |
| **PII** | Does this workflow receive or store names, emails, phone numbers, or addresses? If yes, `saveDataSuccessExecution: "none"` — and is `docs/pii-and-compliance.md` up to date? |
| **Payload validation** | Is there an IF node after the webhook trigger that checks required fields before any processing? |
| **Feature guard** | If this is a billable feature, is there a `client_features` guard? |
| **Signing secrets** | If this involves a signed URL or HMAC flow, does the signing secret stay server-side (never in browser network traffic)? |

**If any check fails, do not move on.** Add a fix step to the appropriate phase before proceeding.

### 4b. Test coverage — interview style

For each webhook, ask:

> "What's the test strategy for [workflow name]? Walk me through:
> - What does a passing request look like?
> - What are the two most likely ways a real caller could send a bad request?
> - Is there a DB side effect we should assert on (not just the HTTP response)?
> - Can this test run against staging without affecting real client data? If not, what fixture/seed does it need?"

Use the answers to populate the test coverage table in the plan.

For frontend components:
> "What does this component look like when data is loading? When it's empty? When the API call fails? Which of those states should the Playwright spec cover?"

### 4c. Surface what you noticed

After the interviews, proactively flag anything the user didn't raise:

> "A couple of things I noticed that we should address:
> - [e.g. "The new [Admin] Get Client Config workflow accepts a `slug` query param — I want to make sure we parameterize that in the SQL rather than interpolate it, same issue as Get AI Usage had"]
> - [e.g. "This workflow touches `leads.email` — that's PII, so we need `saveDataSuccessExecution: none` and a line in pii-and-compliance.md"]"

### Gate 4 close

> "Security and test coverage look good. Here's the full checklist:
> [12-item security checklist, each with ✅ or ⚠️ + fix-in-phase-N]
>
> Does anything here need more discussion before I write the plan?"

---

## Gate 5 — Write, Audit, Commit

### 5a. Consistency subagent

Before writing anything, spawn a subagent with the full draft plan and these instructions:

> "Audit this sprint plan for consistency. Check:
> 1. Every column name against the live DB schema provided — flag any that don't match exactly
> 2. Every workflow name against the registry in `workflows/README.md` — flag any mismatches
> 3. Every SQL block — flag any that use string interpolation instead of `$1`/`$2` parameters
> 4. Every phase step that references a prerequisite — confirm the prerequisite is captured earlier in the plan
> 5. Every test file referenced — confirm it's described somewhere in the test coverage section
> 6. Every security check that flagged a risk — confirm there's a fix step in some phase
> Report findings as a numbered list. Be specific — line references if possible."

Fix all findings before writing the plan file.

### 5b. Write the plan file

**File:** `.claude/plans/<kebab-case-title>.md`

```markdown
# [Sprint Title]

**Status: PLANNING**  
**Started:** YYYY-MM-DD

## Goal
[One paragraph — the core problem and how this sprint solves it]

## Scope
- **Repos:** [list]
- **Tables modified:** [list with migration type: add column / rename / drop / new table]
- **Workflows modified:** [list with version bump noted]
- **Workflows created:** [list]
- **Frontend components:** [list with repo]
- **Deferred / out of scope:** [list]

## Phase Overview
| Phase | Name | Type | Notes |
|---|---|---|---|
| 0 | DB Migrations | Sequential | ⚠️ Step N off-hours |
| ... | ... | ... | ... |

## Pre-flight Queries
[SQL for each phase that has a gate check, labeled by phase]

## Build Order

### Phase 0 — [Name]
[Numbered steps. For SQL steps: include the exact SQL. For workflow steps: include the workflow name, staging ID, and the exact change.]

### Phase 1 — [Name]
...

### Phase T — Test Infrastructure
[T1–TN steps. Note which ones Claude can do autonomously vs which need user input.]

### Phase 2 — [Name]
[Each step ends with: → test file: `tests/workflows/<name>.test.ts`]

...

## Security Checklist
| Check | Status | Notes |
|---|---|---|
| Webhook auth (Header Auth) | ✅ all webhooks | — |
| SQL parameterization | ✅ | No string interpolation |
| No secrets in workflow JSON | ✅ | Credential names only |
| PII — saveDataSuccessExecution | ✅ / ⚠️ Phase N | [if applicable] |
| Payload validation (IF node) | ✅ | — |
| Feature guards | ✅ | — |
| Signing secrets server-side only | ✅ | — |

## Test Coverage
| Workflow | Test file | Covers |
|---|---|---|
| `[Workflow Name]` | `tests/workflows/name.test.ts` | Auth rejection, missing fields, happy path, DB assertion |

## Known Risks
[Bullet list — timing-sensitive operations, blast radius, rollback paths]

## Requires cewall0
[Any steps that need infrastructure, DB access, OAuth reconnects, GitHub admin, or branch protection]
```

### 5c. Update OPEN_ITEMS

For each blocker discovered during the audit that must be resolved before this sprint can start:
- Add a section to `OPEN_ITEMS.md` using the standard format
- Reference the sprint plan name for context
- Do not add items that can be resolved within this sprint itself

### 5d. Commit

Stage only the plan file and any OPEN_ITEMS changes:
```
feat: add sprint plan — <title>
```

### 5e. Handoff summary

> "Plan written to `.claude/plans/<name>.md` and committed.
>
> **Ready to run now:**
> - Phase [X] — [why it's unblocked]
>
> **Blocked:**
> - Phase [Y] — [what's blocking it and where that's tracked]
>
> **Needs cewall0:**
> - [list]
>
> To start executing, run `/admin-sprint` (or whichever execution skill covers this sprint). Or tell me which phase you want to kick off."

---

## Key Rules

- **Never build during planning** — this skill produces a plan file, not workflows or code
- **Always query live DB schema** — never trust memory, docs, or prior sessions for column names. The `config` vs `metadata` incident is the standing example of why: a wrong column name propagated into 3 places before the live query caught it
- **Ask all questions in a gate at once** — one message per gate, not one question at a time
- **Pressure-test before committing** — a clean-looking plan that hasn't been stress-tested will have a surprise during Phase 0
- **Security findings go into phase steps** — don't just flag them in the checklist; add a concrete fix step to the appropriate phase
- **Subagent audit before writing** — the consistency subagent catches what the design review misses: column name typos, missing prerequisites, unreferenced test files
- **Off-hours windows must be explicit** — if a step creates a gap between DB state and workflow state, mark it `⚠️ Off-hours` in the plan and add the "deploy immediately after SQL" instruction