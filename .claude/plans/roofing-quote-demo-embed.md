# Roofing Quote Demo Embed (caiacdigital.com)

**Status:** IN PROGRESS
**Repos touched:** `caiac-website` only. n8n side (`[Quote] Roofing Bot v1.0.0`, `[Quote] Analyze Roof v1.0.0`) is already built, tested, and deployed to prod — see `workflows/README.md` Quote Layer.

## Goal

Show the satellite roofing quote bot as a live, interactive "automation in action" demo on the homepage — not just a chat FAQ, but something that visibly *does work* (fetches satellite imagery, measures a roof, prices a job).

## Placement

`VideoSection` (currently a single centered "Watch a live lead capture workflow" video card) becomes a **two-up grid**:
- **Left:** existing lead-capture video card, unchanged (`VideoLightbox`)
- **Right:** new roofing quote card, same visual language (thumbnail → click → modal), opens a live chat mini-widget instead of a YouTube iframe

`DemoSection` (the RAG chat vertical switcher) stays immediately after, unchanged — general AI Q&A demos are a separate story from "watch an automation work."

Section copy changes from "Watch a live lead capture workflow..." to something like "Two automations. Watch them work." with per-card captions:
- "Watch our lead capture in action"
- "See a roofing quote built from a satellite photo"

## New component: `RoofQuoteLightbox`

Sibling to `VideoLightbox`, same modal shell/mechanics (thumbnail card → click → centered modal, Escape/backdrop to close), duplicated rather than abstracted (only 2 instances — matches existing codebase style of purpose-built components over premature shared abstractions).

- **Thumbnail:** stylized graphic (gradient + 🛰️ + label), not a real satellite image — avoids sourcing/hosting/licensing a static image asset that could look stale or mismatched.
- **Modal content:** renders `RoofQuoteDemo` (new chat widget) instead of an iframe.

## New component: `RoofQuoteDemo`

Forks ~70% of `DemoChat.tsx` (message list, input footer, `FormattedAnswer` markdown renderer) but talks to a different backend:

- **Endpoint:** `https://flows.caiacdigital.com/webhook/40867111-9643-4156-8d67-fecf9b23cb93/chat` (the bot's own `chatTrigger` webhook — NOT the `/webhook/public/chat` gateway `DemoChat` uses; different protocol)
- **Request:** `{ chatInput, sessionId, action: "sendMessage" }`
- **Response:** `{ output: "..." }` (inferred from `n8n_test_workflow` chat-mode testing; **not yet confirmed against a real successful call** — prod is currently blocked by an expired `Caiac Group Sheets` OAuth2 credential, see `docs/prod-state.md` Known Prod Bugs. Verify the real response shape with a live curl once that's reconnected, before/while wiring this up.)
- **Loading state (the important part):** first turn takes 15–17s (geocode → satellite fetch → Claude Vision → pitch/waste math), vs. `DemoChat`'s ~2-5s RAG turns. A generic spinner reads as broken at that latency. Cycle a staged status line instead:
  ```
  📍 Locating property...
  🛰️ Pulling satellite imagery...
  🤖 Claude Vision measuring your roof...
  🧮 Calculating your quote...
  ```
- Conversation continues inline after the first reply (material choice → layer count → full itemized quote), same as talking to the bot directly.

## Open items before/during build

1. **Blocked on:** prod `Caiac Group Sheets` credential reconnect (manual, cewall0) — needed to confirm the real webhook response shape before finalizing the fetch/parse logic. Can build the UI shell and staged-loading animation in parallel; wire up final response parsing once verified.
2. Confirm exact copy for section intro + card captions before shipping (placeholder text above).
3. `allowedOrigins: "*"` is currently set on the Roofing Bot's Chat Trigger — fine for a demo, but worth locking to `caiacdigital.com` once this is the only place it's embedded (same pattern as the `wallace-chemistry` origin lockdown open item).
