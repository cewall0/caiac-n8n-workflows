#!/usr/bin/env bash
# test-auth.sh — Sign in to CAIAC staging and export a valid session token.
#
# Required env vars (set before sourcing or running):
#   CAIAC_EMAIL            e.g. admin@caiacdigital.com
#   CAIAC_PASSWORD         staff password
#   CLIENT_WEBHOOK_SECRET  webhook_secret from caiac.clients (henderson) or Cloudflare Pages env
#
# Optional:
#   N8N_BASE  (default: https://flows-staging.caiacdigital.com/webhook)
#
# Usage:
#   source vps-scripts/test-auth.sh   → exports $CAIAC_TOKEN, $CLIENT_WEBHOOK_SECRET
#   bash vps-scripts/test-auth.sh     → prints token and exits 0

set -euo pipefail

N8N_BASE="${N8N_BASE:-https://flows-staging.caiacdigital.com/webhook}"
: "${CAIAC_EMAIL:?Set CAIAC_EMAIL before running}"
: "${CAIAC_PASSWORD:?Set CAIAC_PASSWORD before running}"
: "${CLIENT_WEBHOOK_SECRET:?Set CLIENT_WEBHOOK_SECRET before running}"

# HMAC-SHA256(secret, "${timestamp}.${subject}") → lowercase hex
# Matches sign.ts exactly.
_hmac_sign() {
  local secret="$1" subject="$2"
  local ts; ts=$(date +%s)
  local payload="${ts}.${subject}"
  local sig; sig=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$secret" -hex | awk '{print $NF}')
  printf '%s:%s' "$ts" "$sig"
}

# Sign-in: subject = email  (see auth-signin.ts)
_ts_sig=$(_hmac_sign "$CLIENT_WEBHOOK_SECRET" "$CAIAC_EMAIL")
_TS=${_ts_sig%%:*}
_SIG=${_ts_sig##*:}

_resp=$(curl -sS -X POST "${N8N_BASE}/caiac/auth/signin" \
  -H "Content-Type: application/json" \
  -H "x-caiac-timestamp: ${_TS}" \
  -H "x-caiac-signature: ${_SIG}" \
  -d "{\"email\":\"${CAIAC_EMAIL}\",\"password\":\"${CAIAC_PASSWORD}\",\"client_id\":\"henderson\"}")

_token=$(printf '%s' "$_resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)

if [[ -z "$_token" ]]; then
  echo "❌ Sign-in failed:" >&2
  echo "$_resp" | python3 -m json.tool 2>/dev/null || echo "$_resp" >&2
  exit 1
fi

export CAIAC_TOKEN="$_token"
echo "✅ Signed in — token: ${CAIAC_TOKEN:0:16}..." >&2

# If not sourced (i.e. run directly), just print the token
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "$CAIAC_TOKEN"
fi
