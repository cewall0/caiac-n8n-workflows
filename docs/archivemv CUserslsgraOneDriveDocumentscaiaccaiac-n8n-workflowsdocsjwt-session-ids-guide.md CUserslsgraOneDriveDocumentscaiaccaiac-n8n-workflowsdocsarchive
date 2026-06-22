# JWT Service Patch — `caiac_api.py`

**Who:** Dad  
**Why:** Confirmed via live test (2026-06-18): `/jwt/generate` accepts `jti`, `sid`, `is_caiac_staff`, `name` in the request body but silently drops them — only `user_id`, `client_id`, `slug`, `role`, `email`, `exp` end up in the token. Full Auth v2.0.0 decodes the JWT and reads `jti` and `sid` from the payload, so they must be present or auth fails for every user.

---

## What to Find

In `caiac_api.py`, find the `/jwt/generate` endpoint. Look for a dict that gets passed to `jwt.encode()`. It probably looks like this:

```python
payload = {
    "user_id": ...,
    "client_id": ...,
    "slug": ...,
    "role": ...,
    "email": ...,
    "exp": ...
}
token = jwt.encode(payload, jwt_secret, algorithm="HS256")
```

---

## What to Change

Add the four missing fields to that payload dict:

```python
payload = {
    "user_id": data.get("user_id"),
    "client_id": data.get("client_id"),
    "slug": data.get("slug"),
    "role": data.get("role"),
    "email": data.get("email"),
    "jti": data.get("jti"),           # ← add this
    "sid": data.get("sid"),           # ← add this
    "is_caiac_staff": data.get("is_caiac_staff", False),  # ← add this
    "name": data.get("name"),         # ← add this
    "exp": datetime.utcnow() + timedelta(hours=1)
}
```

The exact variable name (`data`, `body`, `request`, etc.) depends on the framework you used. The key point is just adding those four keys from the incoming request into the payload dict before encoding.

---

## After Changing the File

Restart the service so the change takes effect:

```bash
# If running with systemd:
sudo systemctl restart caiac-api

# If running with supervisor:
sudo supervisorctl restart caiac_api

# If running directly with Python in a screen/tmux:
# Ctrl+C the process, then re-run it

# If running in Docker (check with: docker ps | grep caiac):
docker restart <container_name>
```

---

## How to Verify the Fix

Run this one-liner on the VPS after restarting. It calls `/jwt/generate` with test data and decodes the token to check the claims:

```bash
python3 - <<'EOF'
import requests, base64, json

r = requests.post("http://localhost:8000/jwt/generate", json={
    "user_id": "test",
    "client_id": "test",
    "slug": "henderson",
    "role": "admin",
    "email": "test@test.com",
    "jwt_secret": "test-secret-key-1234567890abcdef",
    "jti": "test-jti",
    "sid": "test-sid",
    "is_caiac_staff": True,
    "name": "Test User"
})
token = r.json().get("token", "")
payload_b64 = token.split(".")[1] + "=="
payload = json.loads(base64.b64decode(payload_b64))
print("Claims in token:", list(payload.keys()))
print("has jti:", "jti" in payload)
print("has sid:", "sid" in payload)
print("has is_caiac_staff:", "is_caiac_staff" in payload)
print("has name:", "name" in payload)
EOF
```

Expected output after the fix:
```
Claims in token: ['user_id', 'client_id', 'slug', 'role', 'email', 'jti', 'sid', 'is_caiac_staff', 'name', 'exp']
has jti: True
has sid: True
has is_caiac_staff: True
has name: True
```

---

## Also: Refresh v2.0.0 calls `/jwt/generate` too

`CAIAC Auth - Refresh v2.0.0` also calls `/jwt/generate` when issuing a new token on refresh. It passes a new `jti` but the same `sid`. This will work correctly once the fix is in place — no n8n changes needed.
