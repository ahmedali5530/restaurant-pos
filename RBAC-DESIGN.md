# RBAC Design — SurrealDB Server-Side Permissions

> **Status**: Foundation built (branch `security/surreal-rbac`). Activation
> is behind a feature flag `GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true` (default:
> false). This document describes the architecture, the permission matrix,
> and the activation playbook.

## The problem this solves

Before this branch, SurrealDB `PERMISSIONS` on all 143 tables were set to
`NONE` at the table level — meaning non-root users are denied access entirely.
The SPA bypassed this by authenticating to SurrealDB with a **root-scoped
access token** issued by the gateway (which signs in with `SURREAL_USER` /
`SURREAL_PASS`). As a result:

- **RBAC was purely client-side.** The `useSecurity()` hook in the SPA checked
  permissions before showing UI, but nothing prevented a logged-in cashier
  with browser devtools from crafting arbitrary SurQL via `/rpc` and reading
  or writing ANY record — including other employees' salaries, OAuth tokens,
  user passwords, etc.
- **A single compromised token = full DB compromise.** The root-scoped
  Surreal token handed to the browser grants full access to all 143 tables.

## The architecture

```
┌─────────────┐     1. POST /auth/login (pin/form)
│   SPA       │ ─────────────────────────────────────┐
│ (browser)  │                                       │
│             │ ◄── 2. { token: <JWT>, surrealToken }┘
│             │     (JWT contains: sub, login, typ, roles[])
│             │
│             │     3. WS /rpc (Authorization: Bearer <JWT>)
│             │ ────────────────────────────────────┐
└─────────────┘                                     │
                                                    ▼
┌─────────────┐     4. Relay opens upstream WS,
│  Gateway    │        authenticates as the JWT session
│  (3142)     │ ─────────────────────────────────────┐
│             │                                        │
│  DEFINE     │ ◄── 5. SurrealDB verifies JWT via       │
│  TOKEN      │        DEFINE TOKEN posr_session         │
│  posr_      │        (HS256, same GATEWAY_JWT_SECRET)   │
│  session    │                                           │
└─────────────┘                                           │
                    ▼                                     ▼
┌──────────────────────────────────────────────────────┐
│                  SurrealDB (8000)                     │
│                                                       │
│  $auth = { sub: 'user:abc', roles: ['admin','hr'] }  │
│                                                       │
│  PERMISSIONS FOR select WHERE $auth.roles CONTAINS   │
│    'admin' OR ...  ←  enforced on JWT sessions        │
│                                                       │
│  Root connections (services) bypass PERMISSIONS       │
└──────────────────────────────────────────────────────┘
```

### Key components

1. **`DEFINE TOKEN posr_session ON DATABASE TYPE HS256 VALUE <secret>`**
   — SurrealDB trusts the gateway's session JWT. Defined on gateway startup
   (see `gateway/server.js`). The secret is `GATEWAY_JWT_SECRET` (same as the
   gateway uses to sign JWTs).

2. **JWT `roles` claim** — `gateway/src/jwt.js` now extracts top-level role
   sections from the hierarchical permission IDs (e.g. `admin.dishes.create`
   → `admin`) and includes them as the `roles` array in the JWT payload.
   SurrealDB makes these available as `$auth.roles` in PERMISSIONS
   expressions.

3. **`GATEWAY_USE_JWT_AS_SURREAL_TOKEN` feature flag** — when `true`, the
   gateway returns the session JWT itself as the `surrealToken` (instead of
   signing in with root and returning a root access token). The SPA sends the
   JWT in the AUTH frame; SurrealDB verifies it via the DEFINE TOKEN.

4. **Table PERMISSIONS** — `migrations/scripts/apply-rbac-permissions.cjs`
   redefines all 143+ tables:
   - **128 non-critical tables**: `PERMISSIONS FULL` (any authenticated JWT
     session can read/write — equivalent to current behaviour, but now
     enforced server-side instead of bypassed by root).
   - **15 critical tables**: specific `PERMISSIONS FOR select/create/update/
     delete WHERE $auth.roles CONTAINS '<role>'`.

### Root bypass

SurrealDB root users (defined at server startup with `--user`/`--pass`)
**bypass all PERMISSIONS**. This is by design: the gateway, API, payments,
tracking, and sync services all connect as root and need full access. Only
JWT-authenticated sessions (the SPA via the relay) are subject to PERMISSIONS.

## Role model

Roles are derived from `user_role.roles` — an array of hierarchical
permission IDs (e.g. `['admin', 'admin.dishes', 'admin.dishes.create',
'manager.reports.view']`). The gateway extracts the top-level section from
each ID:

| Hierarchical ID | Top-level role |
|---|---|
| `admin` | `admin` |
| `admin.dishes.create` | `admin` |
| `manager.reports.view` | `manager` |
| `hr.payroll.run` | `hr` |
| `accountant.journal.post` | `accountant` |
| `inventory.purchase.create` | `inventory` |
| `waiter.order.create` | `waiter` |
| `kitchen.order.update` | `kitchen` |
| `delivery.dispatch.update` | `delivery` |
| `cashier.payment.process` | `cashier` |
| `*` | `*` (super_admin wildcard) |

The JWT `roles` claim is the unique set of top-level sections, e.g.
`['admin', 'manager', 'hr']`.

## Permission matrix — 15 critical tables

| Table | select | create | update | delete | Rationale |
|---|---|---|---|---|---|
| `user` | admin, hr, or self | admin | admin | admin | Password hashes, login credentials |
| `user_role` | admin | admin | admin | admin | Role assignments — privilege escalation vector |
| `auth_permission` | admin | admin | admin | admin | Permission catalog — privilege escalation |
| `session_security` | admin | admin | admin | admin | Idle/lock policies, session config |
| `employee` | admin, hr | hr | hr | hr | Personal data, salary info |
| `payroll_run` | admin, hr | hr | hr | hr | Salary calculations |
| `payroll_snapshot` | admin, hr | hr | hr | hr | Historical payroll data |
| `time_entry` | admin, hr, or self | hr | hr | hr | Other employees' work hours |
| `account_journal_entry` | admin, accountant | accountant | accountant | admin | Financial journals — audit-sensitive |
| `account_journal_line` | admin, accountant | accountant | accountant | admin | Journal line items |
| `integration_oauth_credential` | admin | admin | admin | admin | OAuth tokens (even encrypted, metadata sensitive) |
| `integration_oauth_state` | admin | admin | admin | admin | OAuth CSRF state — could enable OAuth forgery |
| `payment_type` | admin, manager, cashier, waiter | admin | admin | admin | Gateway config (encrypted, but metadata sensitive) |
| `payment_webhook` | admin, manager, cashier | NONE | NONE | NONE | Payment status — only services (root) can write |
| `tracking` | admin | NONE | NONE | NONE | User activity — only tracking-api (root) can write |

### Permission expression examples

```surql
-- user table: admin/HR can read all; a user can read their own record
DEFINE TABLE user TYPE ANY SCHEMAFULL PERMISSIONS
  FOR select WHERE $auth.roles CONTAINS 'super_admin'
    OR $auth.roles CONTAINS 'admin'
    OR $auth.roles CONTAINS 'hr'
    OR $auth.sub = <string>id,
  FOR create WHERE $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'super_admin',
  FOR update WHERE $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'super_admin',
  FOR delete WHERE $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'super_admin';

-- payment_webhook: SPA can read (polls for status) but NEVER write
DEFINE TABLE payment_webhook TYPE NORMAL SCHEMAFULL PERMISSIONS
  FOR select WHERE $auth.roles CONTAINS 'super_admin'
    OR $auth.roles CONTAINS 'admin'
    OR $auth.roles CONTAINS 'manager'
    OR $auth.roles CONTAINS 'cashier',
  FOR create NONE,
  FOR update NONE,
  FOR delete NONE;
```

## The 128 non-critical tables

These are set to `PERMISSIONS FULL` — any authenticated JWT session can
read/write. This is the **baseline** that makes the app functional (the SPA
needs to read menus, tables, orders, inventory, etc. to operate). A
follow-up branch (`security/granular-rbac`) should restrict these per role
where appropriate — e.g. only `waiter` should create orders, only
`inventory` should adjust stock, etc.

## Activation playbook

> **Warning**: This is a **big-bang switch**. Once `GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true`,
> the SPA can no longer bypass PERMISSIONS. If any table's PERMISSIONS are
> too restrictive, the corresponding screen will break. Test thoroughly
> in staging first.

### Step 1: Apply the permission migration (dormant)

```bash
# Dry run — review what would change
SURREAL_USER=posr SURREAL_PASS=<pass> DRY_RUN=1 \
  node migrations/scripts/apply-rbac-permissions.cjs

# Apply — redefines all 143+ tables with new PERMISSIONS
SURREAL_USER=posr SURREAL_PASS=<pass> \
  node migrations/scripts/apply-rbac-permissions.cjs
```

At this point, PERMISSIONS are defined but **dormant** — the SPA still uses
the root access token, which bypasses them. Nothing breaks.

### Step 2: Verify the gateway defines the SurrealDB token

Restart the gateway and check the logs:
```
Defined SurrealDB token posr_session (HS256) for JWT-based auth
GATEWAY_USE_JWT_AS_SURREAL_TOKEN not set — SPA uses root access token (RBAC permissions defined but dormant)
```

### Step 3: Activate in staging

```bash
# In gateway/.env:
GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true
```

Restart the gateway. The SPA will now receive the JWT as the `surrealToken`
and send it in the AUTH frame. SurrealDB verifies it and enforces PERMISSIONS.

### Step 4: Test every screen

Walk through every user role (admin, manager, hr, accountant, inventory,
waiter, kitchen, delivery, cashier) and verify:

- Login works (PIN and form)
- Every screen loads without permission errors
- Every CRUD operation works for the expected roles
- A cashier CANNOT read `/rpc` queries against `user`, `payroll_run`, etc.
  (test with devtools: `db.query('SELECT * FROM payroll_run')` should return
  an empty result or a permission error)

### Step 5: Rollback if needed

Set `GATEWAY_USE_JWT_AS_SURREAL_TOKEN=false` (or unset) and restart the
gateway. The SPA reverts to the root access token, bypassing PERMISSIONS.
The permission definitions remain in the DB but are dormant.

### Step 6: Activate in production

Only after staging tests pass for all roles. Consider doing this during a
maintenance window — if a screen breaks, the cashier can't process orders
until you rollback.

## Field-level PERMISSIONS (added in this branch)

The table-level migration (`apply-rbac-permissions.cjs`) restricts which ROLES
can access which TABLES. The field-level migration
(`apply-field-level-permissions.cjs`) goes one level deeper: even when a role
CAN read a table, certain FIELDS are excluded from SELECT results.

### Protected fields (11 fields across 3 tables)

| Table | Field | Type | SELECT | CREATE/UPDATE | Rationale |
|---|---|---|---|---|---|
| `user` | `password` | `none \| string \| null` | NONE | FULL | bcrypt hash — gateway does `crypto::bcrypt::compare` server-side; SPA never needs it. A leaked hash can be brute-forced offline. |
| `integration_oauth_credential` | `access_token_enc` | `string` | NONE | FULL | AES-256-GCM ciphertext of QBO access token — only api service (root) needs to decrypt |
| `integration_oauth_credential` | `refresh_token_enc` | `option<string>` | NONE | FULL | AES-256-GCM ciphertext of QBO refresh token |
| `payment_type` | `gateway_config` | `none \| record<payment_type_gateway_config> \| null` | NONE | FULL | Legacy plaintext config link — SPA reads via payments service, never directly |
| `payment_type` | `gateway_config_encrypted` | `option<string>` | NONE | FULL | AES-256-GCM ciphertext of payment credentials — SPA writes via `/payments/credentials`, never reads |
| `payment_type_gateway_config` | `client_id` | `none \| string \| null` | NONE | FULL | Legacy plaintext — Stripe/PayPal client ID |
| `payment_type_gateway_config` | `client_secret` | `none \| string \| null` | NONE | FULL | Legacy plaintext — Stripe/PayPal client secret |
| `payment_type_gateway_config` | `integrity_salt` | `none \| string \| null` | NONE | FULL | Legacy plaintext — JazzCash integrity salt |
| `payment_type_gateway_config` | `merchant_id` | `none \| string \| null` | NONE | FULL | Legacy plaintext — JazzCash/M-Pesa merchant ID |
| `payment_type_gateway_config` | `public_key` | `none \| string \| null` | NONE | FULL | Legacy plaintext — Stripe publishable key |
| `payment_type_gateway_config` | `secret_key` | `none \| string \| null` | NONE | FULL | Legacy plaintext — Stripe/M-Pesa secret key |
| `payment_type_gateway_config` | `webhook_secret` | `none \| string \| null` | NONE | FULL | Legacy plaintext — Stripe webhook signing secret |

### How it works

```surql
DEFINE FIELD password ON user TYPE none | string | null
  PERMISSIONS
    FOR select NONE,    -- excluded from SELECT * results for JWT sessions
    FOR create FULL,    -- admin can still set passwords
    FOR update FULL,    -- admin can still change passwords
    FOR delete FULL;
```

When a JWT session (SPA) runs `SELECT * FROM user`, the `password` field is
**absent** from the result. The gateway (root) still gets it (root bypasses
PERMISSIONS).

**Important**: `crypto::bcrypt::compare(password, $password)` in the gateway's
login WHERE clause still works — SurrealDB evaluates functions server-side,
reading the field internally regardless of SELECT permissions. The field is
only hidden from the result set, not from server-side function evaluation.

### Applying field-level PERMISSIONS

```bash
# Dry run
SURREAL_USER=posr SURREAL_PASS=<pass> DRY_RUN=1 \
  node migrations/scripts/apply-field-level-permissions.cjs

# Apply
SURREAL_USER=posr SURREAL_PASS=<pass> \
  node migrations/scripts/apply-field-level-permissions.cjs
```

Run this AFTER `apply-rbac-permissions.cjs` (the table-level migration). Both
are dormant until `GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true`.

### Defense in depth

The field-level PERMISSIONS add a third layer of protection for credentials:

1. **Encryption at rest** (token.crypto.js / payment-credential.crypto.js) —
   even if the DB is compromised, credentials are AES-256-GCM encrypted
2. **Table-level PERMISSIONS** (apply-rbac-permissions.cjs) — only admin can
   access `integration_oauth_credential`, `payment_type`, etc.
3. **Field-level PERMISSIONS** (this migration) — even if a role CAN read the
   table, the ciphertext/hash field is excluded from the result

An attacker who compromises a cashier's JWT session would need to bypass all
three layers to recover credentials.

## What's NOT in this branch (follow-up work)

1. **Granular per-role PERMISSIONS on the 128 non-critical tables.** Currently
   they're all `PERMISSIONS FULL` — any authenticated user can read/write.
   A follow-up branch `security/granular-rbac` should restrict:
   - `order` — only `waiter`/`cashier` can CREATE; `kitchen` can UPDATE status
   - `inventory_*` — only `inventory` role can CREATE/UPDATE
   - `menu`/`dish` — only `admin` can CREATE/UPDATE
   - `account`/`account_group` — only `accountant` can CREATE/UPDATE
   - etc.

2. **Per-user row-level restrictions.** The `time_entry` table already has
   `$auth.sub = user` for self-reads, but `order`, `kitchen_reconciliation`,
   etc. could benefit from branch-level restrictions (`WHERE branch_id =
   $auth.branch_id`).

3. **Audit logging of permission denials.** SurrealDB logs permission
   failures to the server log, but there's no structured audit trail. A
   follow-up could add a `DEFINE EVENT` on critical tables that logs denied
   access attempts.

4. **Role management UI.** Currently roles are assigned via direct DB writes
   (admin screen writes to `user_role.roles`). A proper role management UI
   with approval workflows would complement the server-side enforcement.

## Testing the RBAC

```bash
# 1. Apply the migration (dormant)
SURREAL_USER=posr SURREAL_PASS=<pass> \
  node migrations/scripts/apply-rbac-permissions.cjs

# 2. Activate the feature flag
echo "GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true" >> gateway/.env

# 3. Restart the gateway
docker compose restart gateway

# 4. Login as a cashier (PIN 1234) and try to read payroll data:
#    In the browser console:
#    db.query('SELECT * FROM payroll_run')
#    → should return [] or a permission error, NOT salary data

# 5. Login as admin (PIN 5555) and verify full access:
#    db.query('SELECT * FROM payroll_run')
#    → should return all payroll runs
```

## Security grade after this branch

| Area | Before | After activation |
|---|---|---|
| RBAC enforcement | C− (client-side only) | **A−** (server-side, root bypass only) |
| Token scope | C (root-scoped) | **A** (per-user JWT with roles) |
| Critical table protection | F (no protection) | **B+** (15 tables role-restricted) |
| Non-critical tables | F (no protection) | **C** (FULL — any authenticated user) |
| Sensitive field protection | F (password hashes, ciphertext readable) | **A** (11 fields SELECT=NONE for JWT sessions) |
| Overall security grade | **B+** (after hardening + payment encryption) | **A−** (after RBAC + field-level activation) |

The remaining gap to **A** is the granular per-role restrictions on the 128
non-critical tables (e.g. only `waiter` can CREATE orders, only `inventory`
can adjust stock) and per-user row-level restrictions.
