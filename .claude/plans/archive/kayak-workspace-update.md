# Kayak Workspace Update Plan

**Status: IMPLEMENTED — 2026-06-28**
**Goal:** Update the workspace context to reflect the Kayak product direction — what we're building, who we're building it for, and how the existing platform maps to that vision.

---

## What We're NOT Doing
- Resolving merge conflicts in `OPEN_ITEMS.md` or `workflows/README.md` — handled by another process
- Changing any workflow JSON files — existing builds remain valid
- Changing technical build standards, security rules, or n8n conventions in `CLAUDE.md`
- Rewriting `.claude/plans/` — in-progress work (admin sprint, lead architecture, etc.) is still active

---

## Step 1 — Create `docs/kayak-product-strategy.md`

New document. The product vision source of truth for Claude and the team.

**Contents:**
- Product name: **Kayak**
- Vision statement
- Three product tiers:
  - **Tier 1 — Chat:** Upload docs → embeddable chat widget. Entry-level.
  - **Tier 2 — Chat + Lead Capture:** Chat + lead form + automated follow-up sequence.
  - **Tier 3 — Full Platform:** Chat + lead capture + client portal + onboarding + admin panel.
- Target niches (all unregulated, solopreneur or small office, no approval chain):
  - College admissions consultants
  - Real estate investing coaches
  - Career coaches
  - HOA self-managed communities
  - Small property managers (10–50 units)
  - Event venues (wedding/corporate)
  - Boutique hotels and B&Bs
  - Trade school / vocational program admissions
  - Authors and small publishers (book chat widget)
- Buyer profile: independent decision maker, 1–5 people, pays with a credit card, no IT department
- What already exists (map to tiers):
  - RAG chat pipeline → powers Tier 1 chat widget
  - Lead Capture + Score Lead + SMS/email notify → powers Tier 2
  - Client portal, onboarding agent, admin panel, feature flags → powers Tier 3
  - Public Chat Gateway → Tier 1 entry point (unauthenticated, embeddable)
  - Wallace Chemistry as live Tier 1 example (book/textbook chat)
- Demo client profiles to build (one per niche, fictional or real)
- Missing workflows for full Tier 2 support:
  - Lead nurture sequence (multi-step SMS/email over 7–14 days)
  - Appointment reminder (24hr + 1hr before consult)
  - Post-consult follow-up
  - Chat-to-lead capture (visitor chats → lead record created)

---

## Step 2 — Update `CLAUDE.md` Overview Section

**What changes:** Add a `## Product` section near the top of the Overview that:
- Names the product **Kayak**
- Describes the three tiers in one sentence each
- Points to `docs/kayak-product-strategy.md` for full context
- Notes CAIAC as the operating company and first internal client

**What does NOT change:**
- Environment rules (staging default, prod confirmation)
- Key reference docs section
- Adding a new feature checklist
- Platform repos table
- All technical build standards, security rules, naming conventions, patterns

---

## Step 3 — Full Memory File Reevaluation

Review every memory file against the Kayak direction. Do NOT just patch — evaluate whether each is still load-bearing, outdated, or needs to reflect the new product scope.

**Files to review:**

| File | Likely action |
|---|---|
| `project_caiac-build-rules.md` | Update: references "small trades/service businesses" as target — replace with Kayak's tiered niche model |
| `project_caiac-platform-architecture.md` | Update: "CRM targets (Jobber, Housecall Pro, trades vertical)" is no longer the primary direction — update to reflect Kayak's broader market; keep the technical architecture facts |
| `project_caiac-team.md` | Likely still accurate — review only |
| `project_admin-dashboard-sprint.md` | Still active — no change |
| `project_ai-cap-status.md` | Still active — no change |
| `project_pii-compliance.md` | Still active — no change |
| `project_chat-v3-idea.md` | Still relevant — no change |
| `project_full-auth-refactor.md` | Complete — no change |
| `project_bcrypt-hash-unverified.md` | Resolved — no change |
| `project_vps-infrastructure.md` | Still accurate — no change |
| All `feedback_*.md` files | Likely still accurate (n8n patterns, not product direction) — review only |
| `gmail-imap-decision.md` | Still accurate — no change |
| `MEMORY.md` index | Add entry for new Kayak strategy memory after reevaluation |

**New memory to add:**
- `project_kayak-product-direction.md` — product name, tier model, niche list, buyer profile, pointer to the strategy doc

---

## Evaluate This Plan Against Goals

Before executing, confirm:
- [ ] The three tiers accurately describe what we want to sell
- [ ] The niche list is the right starting set (add/remove any)
- [ ] The demo client profile list is the right first builds
- [ ] The missing workflows list is complete for Tier 2
- [ ] Memory file action column is correct (nothing being removed that's still needed)
