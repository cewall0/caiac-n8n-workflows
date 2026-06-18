# Credential Encryption — Spec & Key Rotation Procedure

**Status:** Design spec — not yet implemented  
**Implements:** `caiac.client_crm_configs.crm_config.api_key_encrypted`

---

## How It Works

Client CRM API keys are stored in `caiac.client_crm_configs.crm_config` as a JSONB field `api_key_encrypted`. The value is a base64-encoded pgp symmetric ciphertext produced by PostgreSQL's `pgp_sym_encrypt` function (from the `pgcrypto` extension).

The master encryption key (`CAIAC_ENCRYPTION_KEY`) lives only in n8n's environment variables on the VPS. It is never stored in the DB, never logged, and never appears in workflow node parameters as a literal string.

**Encryption flow:**
```
raw API key (in-flight only)
  → pgp_sym_encrypt($api_key, $CAIAC_ENCRYPTION_KEY)
  → base64-encode the ciphertext
  → store in crm_config JSONB as api_key_encrypted
```

**Decryption flow:**
```
crm_config->>'api_key_encrypted' (base64 ciphertext from DB)
  → decode from base64
  → pgp_sym_decrypt(ciphertext, $CAIAC_ENCRYPTION_KEY)
  → raw API key (used in HTTP Request node, never logged)
```

---

## One-Time Setup

### 1. Enable pgcrypto in Postgres

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Run once. Persistent across restarts.

### 2. Generate the master key

On any machine with OpenSSL:

```bash
openssl rand -base64 48
```

This produces a 64-character base64 string. Save it — you cannot recover it later.

### 3. Add to n8n `.env` on VPS

```
CAIAC_ENCRYPTION_KEY=<your-generated-key>
```

Restart n8n after adding:
```bash
docker compose restart n8n
```

### 4. Verify n8n can read it

In any workflow Code node:
```js
return [{ json: { keyPresent: !!$env.CAIAC_ENCRYPTION_KEY } }];
```

Should return `{ keyPresent: true }`.

---

## Writing a Key (Onboarding)

In n8n, pass `CAIAC_ENCRYPTION_KEY` as a named query parameter — never string-interpolated into SQL.

```sql
UPDATE caiac.client_crm_configs
SET crm_config = jsonb_set(
  crm_config,
  '{api_key_encrypted}',
  to_jsonb(encode(pgp_sym_encrypt($1::text, $2::text), 'base64'))
),
updated_at = now()
WHERE client_id = $3 AND crm_type = $4;
```

Parameters:
- `$1` = raw API key (from onboarding form input — never stored)
- `$2` = `{{ $env.CAIAC_ENCRYPTION_KEY }}`
- `$3` = `client_id UUID`
- `$4` = `crm_type TEXT`

---

## Reading a Key (CRM Adapter Utilities)

```sql
SELECT
  pgp_sym_decrypt(
    decode(crm_config->>'api_key_encrypted', 'base64'),
    $1::text
  ) AS api_key,
  crm_config - 'api_key_encrypted' AS config_meta
FROM caiac.client_crm_configs
WHERE client_id = $2 AND crm_type = $3 AND active = true;
```

Parameters:
- `$1` = `{{ $env.CAIAC_ENCRYPTION_KEY }}`
- `$2` = `client_id UUID`
- `$3` = `crm_type TEXT`

The `api_key` field is passed directly to the HTTP Request node's Authorization header. It is not logged or stored anywhere downstream.

---

## Key Rotation Procedure

**When to rotate:** If the key is suspected compromised, or as a scheduled security practice (annual recommended).

### Step 1 — Generate new key

```bash
openssl rand -base64 48
```

Keep both old and new keys available during the rotation window.

### Step 2 — Re-encrypt all rows (atomic transaction)

Run via a temporary n8n workflow (Manual Trigger → Postgres node) or directly in psql. Pass old and new keys as parameters:

```sql
BEGIN;

UPDATE caiac.client_crm_configs
SET crm_config = jsonb_set(
  crm_config,
  '{api_key_encrypted}',
  to_jsonb(encode(
    pgp_sym_encrypt(
      pgp_sym_decrypt(
        decode(crm_config->>'api_key_encrypted', 'base64'),
        $1::text   -- old CAIAC_ENCRYPTION_KEY
      ),
      $2::text     -- new CAIAC_ENCRYPTION_KEY
    ),
    'base64'
  ))
)
WHERE crm_config ? 'api_key_encrypted';

COMMIT;
```

If the transaction fails, all rows remain on the old key. Nothing is left in a partial state.

### Step 3 — Update env var and restart n8n

```bash
# Edit .env on VPS (replace old key with new key)
# Then:
docker compose restart n8n
```

### Step 4 — Verify

Run the `[Utility] CRM Get Contact` workflow for one client to confirm decryption still works with the new key.

### Step 5 — Dispose of old key

Once verified, the old key can be discarded. Do not keep it in notes, 1Password history, or any persistent store.

---

## Security Posture

| Control | Status |
|---|---|
| Encryption at rest | ✓ pgp_sym_encrypt (AES-256 via pgcrypto) |
| Key not co-located with data | ✓ key in n8n env var, data in Postgres |
| No plaintext keys in DB | ✓ `api_key` field never written |
| No keys in workflow parameters | ✓ key passed as `$env` reference only |
| Audit trail | ✓ `caiac.audit_log` records config changes |
| Key rotation procedure | ✓ documented above — single atomic SQL transaction |

---

## Known Limitations

- **Symmetric encryption:** A single master key protects all client credentials. Compromise of the key compromises all. Mitigated by: key in env var (not DB), rotation procedure documented.
- **No key versioning:** All rows use the same key version. If partial rotation is needed (e.g., rotate one client's key only), that requires a bespoke UPDATE scoped to `client_id`.
- **No HSM:** Master key is stored in a Docker `.env` file on the VPS. Acceptable for current scale; upgrade path is to use a secrets manager (AWS Secrets Manager, Vault) if compliance requirements demand it.
