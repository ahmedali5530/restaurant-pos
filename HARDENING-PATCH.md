# Security Hardening — Patch Application Guide

This document explains how to apply the `security/hardening` branch to your
fork (`markec12345678/restaurant-pos`) and verify the fixes work.

## What you're getting

10 focused commits, 31 files changed (+1196 / −69), 9 critical/high/medium
security fixes, 16 new regression tests, 1 new database migration, 1 operator
documentation file. All 56 pre-existing backend regression tests still pass.

See `SECURITY.md` for the full description of each fix.

## Option A — Apply as a single PR (recommended)

This is the cleanest path: one PR, 10 atomic commits, easy to review and
rollback. Requires you to have a working local clone of your fork.

```bash
# 1. Clone your fork (use a NEW token — the one shared earlier is compromised)
git clone https://github.com/markec12345678/restaurant-pos.git
cd restaurant-pos

# 2. Add upstream and fetch the latest master (1 README commit ahead of you)
git remote add upstream https://github.com/ahmedali5530/restaurant-pos.git
git fetch upstream

# 3. Sync your master with upstream (1 trivial README commit)
git checkout master
git merge upstream/master
git push origin master

# 4. Create a feature branch for the hardening work
git checkout -b security/hardening

# 5. Apply the 10 patches in order
git am /path/to/security-patches/*.patch

# If any patch fails to apply cleanly (e.g. upstream changed the same lines),
# resolve the conflict and continue:
#   git am --continue
# or to abort:
#   git am --abort

# 6. Run the regression tests to confirm everything works
cd gateway && npm install && \
GATEWAY_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  node --test src/jwt.test.js src/surreal-client.test.js src/rate-limiter.test.js src/revocation-store.test.js
cd ../api && npm install && \
  (same env) SURREAL_USER=test SURREAL_PASS=test \
  node --test src/lib/session-auth.middleware.test.js src/lib/surreal-client.test.js
cd ../payments && npm install && \
  (same env) node --test src/lib/session-auth.middleware.test.js src/lib/surreal-client.test.js \
  src/gateways/drivers/paypal.gateway.bypass.test.js

# 7. Push the branch and open a PR against your fork's master
git push -u origin security/hardening
```

## Option B — Cherry-pick individual fixes

If you only want a subset (e.g. only the PayPal bypass and the env placeholders),
cherry-pick from the patch files:

```bash
git checkout -b security/partial master
git am /path/to/security-patches/0001-security-env-*.patch       # env placeholders
git am /path/to/security-patches/0006-security-payments-*.patch   # PayPal bypass
git push -u origin security/partial
```

Each patch file is self-contained — they don't depend on each other except
where noted in `SECURITY.md`.

## Option C — Squash into a single commit

If you prefer one commit on your master:

```bash
git checkout master
git merge --squash security/hardening
git commit -m "security: harden critical defects from 2026-08-27 audit

9 fixes across gateway/api/payments/migrations/docker-compose:
- env.example no longer ships real-looking JWT secret
- API CORS fails closed (was open when API_ALLOWED_ORIGINS unset)
- /auth/login rate-limited (PIN brute-force defence)
- /fiscal/invoice protected by SSRF allow-list
- token.crypto.js refuses plaintext in production
- 13 migration scripts no longer fall back to root/root
- PayPal webhook signature bypass fixed (CRITICAL)
- JWT revocation durable across restarts
- backup service no longer falls back to root/root

16 new regression tests. See SECURITY.md for details."
```

## Required configuration changes before deploying

Once the patches are applied, set these env vars in your `.env` before
starting the stack:

```bash
# 1. Generate a real JWT secret (do NOT reuse the placeholder)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# → put the output in GATEWAY_JWT_SECRET (both .env and api/.env)

# 2. Generate an encryption key for OAuth tokens at rest
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → put the output in INTEGRATION_TOKEN_ENCRYPTION_KEY in api/.env

# 3. Set SURREAL_USER / SURREAL_PASS (must match your existing SurrealDB root user)
SURREAL_USER=posr
SURREAL_PASS=<your-existing-pass>

# 4. Set NODE_ENV=production in production to enable hard-refusal paths
NODE_ENV=production

# 5. Allow-list the frontend origin(s) for the API
API_ALLOWED_ORIGINS=https://posr.yourdomain.com

# 6. Optional: tune the rate limiter
AUTH_LOGIN_MAX_ATTEMPTS=5              # default 5
AUTH_LOGIN_LOCKOUT_MS=900000           # default 15 min
# AUTH_LOGIN_BYPASS_IPS=10.0.0.0/8     # comma-separated IPs that skip limiting

# 7. Optional: tighten the fiscal SSRF allow-list
# FISCAL_ALLOWED_UPSTREAMS=ims.fbr.gov.pk,prs.punjab.gov.pk
# FISCAL_ALLOWED_UPSTREAMS_STRICT=true  # deny the defaults (localhost etc.)
```

## Apply the new database migration

The `revoked_session` table needs to be created before the gateway boots
with the new revocation-store code:

```bash
SURREAL_USER=posr SURREAL_PASS=<your-pass> \
  ./migrations/scripts/apply-migration.sh \
  migrations/2026_08_27_revoked_session_store.surql
```

Or via the WebSocket runner (no Docker required):

```bash
SURREAL_URL=ws://localhost:8000/rpc SURREAL_USER=posr SURREAL_PASS=<your-pass> \
  node migrations/scripts/apply-migration.cjs \
  migrations/2026_08_27_revoked_session_store.surql
```

## Verifying the fixes are effective

After deploying, sanity-check each fix:

```bash
# 1. CORS is now closed
curl -i -X OPTIONS http://localhost:3140/health \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: GET"
# Expect: no Access-Control-Allow-Origin header in the response

# 2. Rate limiting kicks in after 5 failed logins
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" \
    -X POST http://localhost:3142/auth/login \
    -H "Content-Type: application/json" \
    -d '{"method":"pin","login":"0000","password":"0001"}'
done
# Expect: 401, 401, 401, 401, 401, 429

# 3. Fiscal SSRF blocked
curl -s -X POST http://localhost:3140/fiscal/invoice \
  -H "Authorization: Bearer <session-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://169.254.169.254/latest/meta-data/","bearerToken":"x","payload":{}}'
# Expect: 403 with "upstream host is not allowed"

# 4. PayPal webhook without signature is rejected
curl -s -X POST http://localhost:3134/webhooks/paypal/order:INV001 \
  -H "Content-Type: application/json" \
  -d '{"event_type":"CHECKOUT.ORDER.APPROVED","resource":{"id":"order_INV001"}}'
# Expect: 401 "Webhook signature verification failed"
# (Without the fix, this would return 200 and be stored as "paid".)

# 5. Logout survives a gateway restart
#   - login, get token
#   - POST /auth/logout with the token
#   - restart the gateway container
#   - GET /auth/session with the same token
# Expect: 401 "Session revoked" (previously: 200 OK, revocation lost)
```

## What's still NOT fixed (and why)

These items need an architectural decision and larger changes. They are
documented in `SECURITY.md` and tracked for follow-up branches:

1. **SurrealDB `PERMISSIONS` on all 143 tables.** Today every table has
   `PERMISSIONS FULL` and the Surreal token handed to the browser is
   root-scoped — RBAC is purely client-side. A logged-in cashier with devtools
   can read/write ANY record via `/rpc`. Fixing this requires defining a
   SurrealDB role model, auditing every query, and end-to-end testing of every
   screen. Recommended follow-up: `security/surreal-rbac`.

2. **Encryption of payment-gateway credentials at rest.** The `payments`
   service stores Stripe secret keys, M-Pesa consumer secrets, Telebirr RSA
   private keys etc. as plain rows in Surreal — unlike the `api` service's
   `CredentialStore` which encrypts via `token.crypto.js`. Porting the pattern
   is mechanical but touches every gateway driver's `mapCredentials`.
   Recommended follow-up: `security/encrypt-payment-credentials`.

3. **Rate limiting on other auth endpoints** (`/auth/db-token`, `/auth/session`).
   Less critical than `/auth/login` (they require a valid session already),
   but worth adding for defence in depth.

## Reporting issues found in this hardening work

If you discover a defect in the hardening patches themselves, file an issue
on your fork and reference the commit SHA. The patches are intentionally
minimal and surgical — every change is documented in `SECURITY.md` and pinned
by a regression test where feasible.
