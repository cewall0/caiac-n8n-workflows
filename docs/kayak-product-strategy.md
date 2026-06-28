# Kayak — Product Strategy

**Product:** Kayak
**Built by:** CAIAC Digital
**First live client:** Wallace Chemistry (`wallace-chemistry` slug) — Tier 1 book chat widget

---

## Vision

Kayak is a white-label AI-powered client portal for independent professional service businesses. It turns a business's existing knowledge — their docs, manuals, guides, FAQs — into a 24/7 AI assistant that handles repetitive client Q&A, captures and nurtures leads, and automates the work between "first contact" and "paying customer."

Target buyers are independent operators: 1–5 people, owner makes the call, no IT department, no approval chain. They pay with a credit card. They're already running 5–8 tools and will consolidate for the right one.

---

## Three Product Tiers

### Tier 1 — Chat
**What it is:** Upload documents → get an embeddable chat widget. Done in under 30 minutes.

**The problem it solves:** Knowledge-heavy businesses answer the same 20 questions every day. The AI handles them at midnight so the owner doesn't have to.

**What's already built:**
- RAG ingestion pipeline (`[Admin] Ingest Document v1.0.0`)
- Chat v2.6.0 with model selection, cap enforcement, session management
- Public Chat Gateway (`[Chat] Public Gateway v1.0.0`) — unauthenticated, origin-allowlisted, embeddable
- Per-client feature flags (`public_chat` flag gates Tier 1)
- Admin panel: document management, health check, RAG eval

**Live example:** Wallace Chemistry — textbook chat widget embedded on `organicchemistryguide.com`

---

### Tier 2 — Chat + Lead Capture
**What it is:** Tier 1 plus a lead intake form, automated SMS/email follow-up sequence, and appointment reminders.

**The problem it solves:** The prospect who chats at 11pm and fills out a form needs to be followed up with automatically. The owner can't be on call 24/7.

**What's already built:**
- Lead Capture v2.1.0 — webhook intake, owner SMS/email notification, lead scoring
- Score Lead v1.0.0 — Claude-based qualification scoring
- Send Email + Send SMS utilities (Resend + Telnyx)
- `caiac.leads` DB with dedup, lifecycle_stage, intake_data JSONB
- Feature flags: `intake`, `sms`

**What's missing for Tier 2 (needs to be built):**
- `[Intake] Lead Nurture Sequence v1.0.0` — multi-step SMS/email over 7–14 days after lead submits; stops when lead books or responds
- `[Intake] Appointment Reminder v1.0.0` — SMS + email 24hr and 1hr before consult
- `[Intake] Post-Consult Follow-Up v1.0.0` — send recap/docs after consult, request decision
- `[Intake] Chat Lead Capture v1.0.0` — if visitor chats and shares email, create a lead record automatically

---

### Tier 3 — Full Platform
**What it is:** Tier 2 plus a client portal, full onboarding automation, and the Kayak admin panel for the operator.

**The problem it solves:** The full lifecycle from stranger to active managed client — automated.

**What's already built:**
- Onboarding agent + all provisioning sub-workflows
- Client portal (auth, sessions, user management)
- Full JWT auth stack (Signin, Refresh, Signout, Change Password)
- Admin panel: client management, feature toggles, config updates, document management
- Reviews automation layer (poll → process → handle click)
- Nightly Cleanup (session expiry, maintenance)

---

## Target Niches

All niches share the same profile: knowledge-heavy, repetitive Q&A, unregulated, small independent operation, single decision maker, no IT department.

| Niche | Primary tier | Knowledge base type | Pain point |
|---|---|---|---|
| College admissions consultants | Tier 2–3 | School guides, deadline calendars, essay frameworks | Anxious parents text at all hours with the same questions |
| Real estate investing coaches | Tier 2–3 | Deal analysis templates, market research, checklists | Students ask the same "analyze this deal" questions constantly |
| Career coaches | Tier 2 | Resume guides, interview frameworks, negotiation scripts | Same questions from every new client in intake |
| HOA self-managed communities | Tier 1 | CC&Rs, bylaws, meeting minutes, rules | Volunteer board members field the same resident questions |
| Small property managers (10–50 units) | Tier 1–2 | Lease, tenant handbook, maintenance procedures | Tenants call with the same policy questions |
| Event venues (wedding/corporate) | Tier 2 | Venue policies, capacity guide, catering rules, FAQ | Same inquiry questions before every booking call |
| Boutique hotels and B&Bs | Tier 1 | House rules, local recommendations, check-in instructions | Guests email the same pre-arrival questions |
| Trade school / vocational admissions | Tier 1 | Program catalog, certification info, job placement data | Admissions staff repeat the same program FAQs daily |
| Authors and small publishers | Tier 1 | Book PDF(s) | Readers want to ask questions about the content |

---

## Buyer Profile

- **Size:** 1–5 people. Often one operator plus an admin.
- **Decision:** Owner buys. No committee, no IT approval, no legal review.
- **Payment:** Credit card. Same day.
- **Existing tools:** Calendly, Mailchimp or ConvertKit, maybe a generic CRM, Google Workspace. Will consolidate for the right product.
- **Tech sophistication:** Low to medium. "We handle everything" is a strong sell.
- **The admin is the champion:** The owner buys it; the admin becomes the daily power user because it makes their job easier immediately.

---

## Demo Client Profiles to Build

One fictional demo client per niche tier. Used for sales demos and onboarding templates.

| Demo client | Niche | Tier | Status |
|---|---|---|---|
| Wallace Chemistry | Authors/publishers | 1 | Live (real client) |
| TBD — admissions consultant | College admissions | 2–3 | Not built |
| TBD — property manager | Small property manager | 1–2 | Not built |
| TBD — event venue | Wedding/corporate venue | 2 | Not built |
| TBD — B&B | Boutique hospitality | 1 | Not built |

---

## Go-to-Market Direction

- **Channel:** Owner's personal network first → one strong reference client → LinkedIn/community story → referrals
- **Demo strategy:** 10-minute live demo — upload their docs, show the chat answering real questions, show the lead form flowing through. That's the close.
- **Pricing anchor:** MRR. Tier 1 at ~$99–149/mo. Tier 2 at ~$199–299/mo. Tier 3 at ~$399+/mo.
- **Natural upsell:** Every Tier 1 customer who starts asking "can it capture leads?" is a Tier 2 conversation already written.

---

## What Kayak Is NOT

- Not a CRM — Kayak manages automations, not lead records as a primary interface
- Not a website builder — the chat widget embeds on their existing site
- Not an enterprise product — no SOC 2, no HIPAA, no procurement. That's a feature, not a gap.
- Not tied to a single vertical — the platform is parameterized; niches are demo templates, not separate products
