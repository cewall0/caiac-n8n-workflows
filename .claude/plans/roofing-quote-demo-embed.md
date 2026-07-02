# Roofing Quote Demo Embed (caiacdigital.com)

**Status:** BUILT AND VERIFIED — ready to commit on `caiac-website` branch `feat/sales-demo-section`
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
- **Response:** `{ output: "..." }` — **confirmed** against real successful calls on both staging and prod after the `Caiac Group Sheets` OAuth2 credential was reconnected (2026-07-02).
- **Loading state (the important part):** first turn takes 15–17s (geocode → satellite fetch → Claude Vision → pitch/waste math), vs. `DemoChat`'s ~2-5s RAG turns. A generic spinner reads as broken at that latency. Cycle a staged status line instead:
  ```
  📍 Locating property...
  🛰️ Pulling satellite imagery...
  🤖 Claude Vision measuring your roof...
  🧮 Calculating your quote...
  ```
- Conversation continues inline after the first reply (material choice → layer count → full itemized quote), same as talking to the bot directly.

## Status

Fully built and verified end-to-end in a real browser (dev server + Playwright), including a real quote reply from prod (not just the UI shell):
- 2-up section layout, modal open/close, staged loading sequence — zero console errors
- `Caiac Group Sheets` credential reconnected 2026-07-02 (cewall0) — confirmed working on staging + prod
- Real bot reply renders correctly, **including markdown tables** — found and fixed a gap in `FormattedAnswer` (shared with `DemoChat`) that didn't support markdown tables or `---` rules; the roofing bot's material-comparison and quote line items both use tables. Now renders as a real `<table>` with headers, and `---` as a `<hr>`. This improves `DemoChat`'s RAG answers too, not just the new component.
- Lint + typecheck clean across all touched files
- Example address changed to Apex's own base address (6806 S 25 E, Pendleton, IN) at Chad's request — verified it produces a real roof detection (not a road/empty-field false negative)
- **Street View pitch estimation added** (2026-07-02): `[Quote] Analyze Roof v1.0.0` now fetches a Street View image (with coverage check + graceful fallback) alongside the satellite image, so Claude directly observes roof pitch instead of inferring it from shadows. Required enabling Street View Static API in GCP + IP-restricting the API key (178.156.235.122, shared by staging+prod). Deployed and verified live on prod. Loading sequence copy updated to narrate each step (Google Maps → satellite → Street View → mileage → Claude Vision → quote math) — deliberately named-and-specific rather than a generic spinner, since watching the AI narrate real multi-step work is the actual selling point of this demo.

Not yet committed — sitting as working-tree changes on `caiac-website` branch `feat/sales-demo-section`, alongside pre-existing unrelated pricing-tier edits on the same branch (not touched).

## Open items before/during build

1. Confirm exact copy for section intro + card captions before shipping (placeholder text above).
2. `allowedOrigins: "*"` is currently set on the Roofing Bot's Chat Trigger — fine for a demo, but worth locking to `caiacdigital.com` once this is the only place it's embedded (same pattern as the `wallace-chemistry` origin lockdown open item).
