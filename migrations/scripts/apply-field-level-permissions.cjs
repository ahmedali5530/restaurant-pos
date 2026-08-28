'use strict';

/**
 * Field-level RBAC migration: redefine sensitive FIELDS with SELECT=NONE.
 *
 * The table-level migration (apply-rbac-permissions.cjs) restricts which ROLES
 * can access which TABLES. This migration goes one level deeper: even when a
 * role CAN read a table, certain FIELDS should never be sent to the browser.
 *
 * Protected fields:
 *
 *   user.password                        — bcrypt hash. The SPA NEVER needs this;
 *                                           the gateway does crypto::bcrypt::compare
 *                                           server-side. A leaked hash can be brute-forced offline.
 *
 *   integration_oauth_credential.access_token_enc   — AES-256-GCM ciphertext of the
 *   integration_oauth_credential.refresh_token_enc     QBO OAuth access/refresh tokens.
 *                                                     Already encrypted by token.crypto.js,
 *                                                     but the ciphertext itself shouldn't leak.
 *
 *   payment_type.gateway_config           — legacy plaintext link to payment_type_gateway_config.
 *   payment_type.gateway_config_encrypted — AES-256-GCM ciphertext of payment credentials.
 *                                            The SPA writes via /payments/credentials and never
 *                                            needs to read the ciphertext.
 *
 *   payment_type_gateway_config.*         — all 7 legacy plaintext credential fields:
 *     client_id, client_secret, integrity_salt, merchant_id, public_key, secret_key, webhook_secret
 *
 * All these fields keep FULL for CREATE/UPDATE (admin needs to write them) — only
 * SELECT is denied. This means:
 *   - The gateway (root) can still read them (root bypasses PERMISSIONS)
 *   - The payments service (root) can still decrypt them
 *   - A JWT session (SPA) cannot read them — they're excluded from SELECT * results
 *
 * Effect: even if a cashier with devtools runs `SELECT * FROM user` via /rpc,
 * the `password` field is absent from the result. Same for OAuth tokens, payment
 * ciphertext, etc.
 *
 * Idempotent. Dormant until GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true (root bypasses
 * PERMISSIONS when the flag is off).
 *
 * Usage:
 *   SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-field-level-permissions.cjs
 *
 *   # Dry run:
 *   DRY_RUN=1 SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-field-level-permissions.cjs
 */

const { Surreal } = require('surrealdb');

const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

if (!DB_USER || !DB_PASS) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS are required (no root/root fallback).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Field permission definitions.
//
// Each entry: { table, field, type, select, create, update, delete }
//   - type: the SurrealDB type expression (must match the existing field)
//   - select/create/update/delete: 'NONE', 'FULL', or a WHERE expression
//
// For sensitive fields we set select=NONE (denied for JWT sessions) but keep
// create/update=FULL (admin can still set passwords / save credentials).
// ---------------------------------------------------------------------------

function adminOrFull() {
  // Admin can do everything; everyone else gets the rule.
  // For fields, this is typically just FULL (the table-level permission already
  // restricts who can access the table). The field-level rule adds SELECT=NONE
  // to strip the field from results.
  return 'FULL';
}

const SENSITIVE_FIELDS = [
  // --- user.password: bcrypt hash, never sent to browser ---
  {
    table: 'user',
    field: 'password',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'bcrypt hash — gateway does crypto::bcrypt::compare server-side; SPA never needs it',
  },

  // --- integration_oauth_credential: encrypted OAuth token ciphertext ---
  {
    table: 'integration_oauth_credential',
    field: 'access_token_enc',
    type: 'string',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'AES-256-GCM ciphertext of QBO access token — only api service (root) needs to decrypt',
  },
  {
    table: 'integration_oauth_credential',
    field: 'refresh_token_enc',
    type: 'option<string>',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'AES-256-GCM ciphertext of QBO refresh token',
  },

  // --- payment_type: gateway credential storage ---
  {
    table: 'payment_type',
    field: 'gateway_config',
    type: 'none | record<payment_type_gateway_config> | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext config link — SPA reads via payments service, never directly',
  },
  {
    table: 'payment_type',
    field: 'gateway_config_encrypted',
    type: 'option<string>',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'AES-256-GCM ciphertext of payment credentials — SPA writes via /payments/credentials, never reads',
  },

  // --- payment_type_gateway_config: all 7 legacy plaintext credential fields ---
  {
    table: 'payment_type_gateway_config',
    field: 'client_id',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — Stripe/PayPal client ID',
  },
  {
    table: 'payment_type_gateway_config',
    field: 'client_secret',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — Stripe/PayPal client secret',
  },
  {
    table: 'payment_type_gateway_config',
    field: 'integrity_salt',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — JazzCash integrity salt',
  },
  {
    table: 'payment_type_gateway_config',
    field: 'merchant_id',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — JazzCash/M-Pesa merchant ID',
  },
  {
    table: 'payment_type_gateway_config',
    field: 'public_key',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — Stripe publishable key',
  },
  {
    table: 'payment_type_gateway_config',
    field: 'secret_key',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — Stripe/M-Pesa secret key',
  },
  {
    table: 'payment_type_gateway_config',
    field: 'webhook_secret',
    type: 'none | string | null',
    select: 'NONE',
    create: 'FULL',
    update: 'FULL',
    delete: 'FULL',
    rationale: 'legacy plaintext credential — Stripe webhook signing secret',
  },
];

function buildPermissionsClause(def) {
  const parts = [];
  for (const op of ['select', 'create', 'update', 'delete']) {
    const rule = def[op];
    if (rule === 'NONE') {
      parts.push(`FOR ${op} NONE`);
    } else if (rule === 'FULL') {
      parts.push(`FOR ${op} FULL`);
    } else {
      parts.push(`FOR ${op} WHERE ${rule}`);
    }
  }
  return `PERMISSIONS ${parts.join(', ')}`;
}

async function main() {
  console.log('Connecting to', DB_URL, 'ns=' + DB_NS, 'db=' + DB_NAME);
  const db = new Surreal();
  await db.connect(DB_URL, {
    namespace: DB_NS,
    database: DB_NAME,
    auth: { username: DB_USER, password: DB_PASS },
  });

  console.log(`Redefining ${SENSITIVE_FIELDS.length} sensitive fields with SELECT=NONE.`);
  console.log('');

  let redefined = 0;
  let failed = 0;

  for (const def of SENSITIVE_FIELDS) {
    const permsClause = buildPermissionsClause(def);
    const ddl = `DEFINE FIELD ${def.field} ON ${def.table} TYPE ${def.type} ${permsClause};`;

    if (DRY_RUN) {
      console.log(`  DRY-RUN  ${def.table}.${def.field.padEnd(25)} ${permsClause}`);
      console.log(`           -- ${def.rationale}`);
      redefined++;
      continue;
    }

    try {
      await db.query(ddl);
      console.log(`  OK       ${def.table}.${def.field.padEnd(25)} ${permsClause}`);
      redefined++;
    } catch (err) {
      console.error(`  FAIL     ${def.table}.${def.field.padEnd(25)} ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Redefined: ${redefined}, failed: ${failed}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}.`);

  if (!DRY_RUN && failed === 0) {
    console.log('');
    console.log('Field-level PERMISSIONS applied. Sensitive fields are now excluded');
    console.log('from SELECT results for JWT sessions (SPA). Root connections (gateway,');
    console.log('api, payments services) still bypass PERMISSIONS and can read them.');
    console.log('');
    console.log('Dormant until GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true (same as the');
    console.log('table-level PERMISSIONS from apply-rbac-permissions.cjs).');
  }

  await db.close();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
