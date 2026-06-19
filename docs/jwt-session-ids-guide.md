# JWT Session IDs: `jti` vs `sid`

**Who this is for:** Dad / secondary Claude instance working on CAIAC n8n workflows.

---

## Two Claims, Two Purposes

Every JWT issued by `CAIAC Auth - Signin v2.0.0` contains two session identifiers:

| Claim | Full Name | Scope | Changes on Refresh? |
|-------|-----------|-------|---------------------|
| `jti` | JWT ID | Per-token | **Yes** — new UUID every time a token is issued or refreshed |
| `sid` | Session ID | Per-login | **No** — same UUID from login until logout |

Both are UUIDs. Both are in the JWT payload (accessible via `Decode JWT` in Full Auth). Both are returned by Full Auth v2.0.0 in its output.

---

## When to Use `sid`

Use `sid` (exposed as `session_id` in Full Auth output) when you need to track a **user's login session** across multiple requests.

**Use `sid` for:**
- Qdrant collection keys for chat history (`session_id` field in Qdrant payloads)
- Agent conversation context — the stable key that ties all turns of a multi-turn agent session together
- Any API response field called `session_id` (Dismiss, Chat Delete, etc.)
- Audit trail grouping: "all actions in this login session"

**Rule of thumb:** If you're asking "who is this user across requests in this login?" → use `sid`.

---

## When to Use `jti`

Use `jti` when you need to identify a **specific token instance**, not the session.

**Use `jti` for:**
- JWT denylist/revocation: to force-invalidate a specific token without ending the whole session
- Per-request deduplication if you ever need idempotency at the token level
- Future: replay attack prevention logs

**Do NOT use `jti` as a session or conversation key** — it changes every time the user's token is refreshed (every ~1 hour), so any data keyed to `jti` will become unreachable after the first refresh.

**Rule of thumb:** `jti` is a security primitive. Unless you're building token revocation, you probably don't need it in application logic.

---

## Where These Values Live

### In the JWT payload (decoded from the token itself)
```json
{
  "user_id": "uuid",
  "client_id": "uuid",
  "slug": "henderson",
  "role": "admin",
  "email": "user@example.com",
  "is_caiac_staff": false,
  "name": "Jane Smith",
  "jti": "uuid-changes-each-token",
  "sid": "uuid-stable-per-login",
  "iat": 1234567890,
  "exp": 1234571490
}
```

### In Full Auth v2.0.0 output
```json
{
  "user_id": "uuid",
  "role": "admin",
  "client_id": "uuid",
  "slug": "henderson",
  "name": "Jane Smith",
  "email": "user@example.com",
  "is_caiac_staff": false,
  "session_id": "<sid value>",
  "jti": "<jti value>"
}
```

Access in a caller workflow after `Call Full Auth`:
```javascript
const session = $('Check Token Valid').first().json;
// session.session_id  ← use for Qdrant / agent context
// session.jti         ← use only if building revocation
```

---

## Token Lifecycle

```
User logs in (Signin v2.0.0)
  → sid generated (UUID, stable for entire session)
  → jti generated (UUID, valid for ~1 hour)
  → JWT issued containing both

Every ~50 min: Refresh v2.0.0 called
  → Same sid carried forward (session continues)
  → New jti issued (old token instance rotated)
  → New JWT returned with updated exp

User logs out (Signout v1.0.0)
  → Session ends; sid is no longer meaningful
  → Client deletes token from storage
  → Future: sid added to revoked_sessions table if forced-logout needed
```

---

## For Agent Session Design

When building an agentic workflow with multi-turn memory:

1. The frontend passes the user's JWT on every request (HMAC-signed as usual)
2. Full Auth v2.0.0 validates and returns `session_id` (= `sid`)
3. The agent workflow uses `session_id` as the Qdrant conversation key
4. On token refresh, `session_id` stays the same → agent context is uninterrupted
5. On new login (after logout/expiry), `session_id` is a new UUID → fresh agent context

This means "agent memory" is naturally scoped to a login session without any extra wiring.

---

## Adding New Claims to the JWT

If you need to add a new field to the JWT (e.g., `plan_tier`, `custom_feature_flag`):

1. Add the field to the `Generate JWT` HTTP node body params in `CAIAC Auth - Signin v2.0.0`
2. Check if `/jwt/generate` at `http://172.18.0.1:8000` passes through extra fields — if not, ask Chad to update the service
3. Add extraction in `Decode JWT` in `[Utility] Full Auth v2.0.0` if needed for client_id lookup
4. Add to `Build Auth Output` in Full Auth v2.0.0 if callers need it
5. Add to `Reissue JWT` node in `CAIAC Auth - Refresh v2.0.0` to keep the claim on refresh

**Do not** add DB-sourced values (like `is_caiac_staff`) to the JWT if they need to be current on every request — those should stay as a DB lookup in Full Auth's `Get User Details` step.
