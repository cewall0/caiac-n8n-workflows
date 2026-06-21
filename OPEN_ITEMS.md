# Open Items

Trailing tasks and unresolved questions from past sessions. Claude maintains this — add when discovered, remove when resolved.

---

## Planned / Not Yet Built

- **CAIAC Tally form + intake smoke test** — Luke needs to configure the CAIAC Tally form and run an end-to-end test through `[Onboarding] Smoke Test v1.0.0` (`1Wmm68uc0ZnWegVK`). Technical blockers cleared 2026-06-20 (pgcrypto enabled, CAIAC_ENCRYPTION_KEY set, bcrypt replaced with pgcrypto in Create Client User).

- **Smoke test + cut over Chat v2.5.0** — Test at `/caiac/chat/v2`, verify auth and RAG, then swap webhook path to `/caiac/chat` and deactivate Chat v2.4.1 (`Wdn95E6Yr6miEHeO`).

- **Rate limiting for Chat v2.5.0** (do after cutover) — Create `caiac.rate_limits (user_id UUID, window_start TIMESTAMPTZ, hit_count INT, PK (user_id, window_start))`, add increment + 429 guard after Check Token Valid, add cleanup to Nightly Cleanup.

- **Remove `Delete Expired Sessions` node from Nightly Cleanup** (`FpYhLFjFD0xpSfNf`) — prep for `caiac.sessions` table deprecation. Safe once confirmed no session-based auth flows remain.

- **`sms` feature workflow** — Feature flag row exists and `sms` is registered in the toggle/seed workflows. The actual SMS workflow using Telnyx is not built yet. Guard pattern is ready — follow `docs/feature-flags.md` checklist when building.

- **Chat v3.0** — Agentic redesign (intent routing, multi-query RAG, structured output). Deferred until Ollama model is upgraded to one that supports JSON mode. Plan documented in `.claude/plans/`.

---

## Future / Low Priority

- **Role-based feature visibility (Layer 2)** — `config JSONB` column in `client_features` is reserved for per-feature role visibility (e.g. `visible_to_roles: ["admin"]`). Not needed until client dashboard exposes feature controls. No migration needed when the time comes.

- **Backfill `score_lead` `client_id` in older leads** — Intake now passes `client_id` to Score Lead. Historical leads scored before this change have no `client_id` attribution in the token log. Low priority unless cost reporting by client becomes important.

- **Deactivate `[Utility] Validate Auth v1.0.0`** (`25FQf7oSGTBlLXqz`) — pre-JWT auth utility, still active. Confirm no callers remain then deactivate.

- **Deactivate `CAIAC Demo - Lead Capture v1.2.0`** (`Z6hV4ALmmPL4IdAr`) — superseded by v2.0.0, still active. Confirm no live traffic then deactivate.
