'use strict';

/**
 * RBAC migration: redefine table PERMISSIONS across all 143 tables.
 *
 * Before this migration: every table has PERMISSIONS NONE at the table level
 * (non-root users denied) and PERMISSIONS FULL at the field level. The SPA
 * bypasses this by using a root-scoped Surreal token — so RBAC is purely
 * client-side (useSecurity hook in the SPA).
 *
 * After this migration:
 *   - Non-critical tables (128): PERMISSIONS FULL — any authenticated JWT
 *     session can read/write. Root services bypass permissions anyway.
 *   - Critical tables (15): specific PERMISSIONS FOR select/create/update/
 *     delete WHERE $auth.roles CONTAINS '<role>'. Only specific roles can
 *     access sensitive data (passwords, payroll, OAuth creds, etc.).
 *
 * The migration preserves each table's TYPE (NORMAL|ANY) and SCHEMAFULL/
 * SCHEMALESS properties by reading the existing DEFINE TABLE statements from
 * migrations/latest.surql and re-emitting them with the new PERMISSIONS.
 *
 * Idempotent: re-running redefines the same tables with the same permissions.
 *
 * Usage:
 *   SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-rbac-permissions.cjs
 *
 *   # Dry run (print what would change without writing):
 *   DRY_RUN=1 SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-rbac-permissions.cjs
 *
 * See: RBAC-DESIGN.md for the full architecture and permission matrix.
 */

const fs = require('fs');
const path = require('path');
const { Surreal } = require('surrealdb');

const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

if (require.main === module && (!DB_USER || !DB_PASS)) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS are required (no root/root fallback).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Critical tables: specific role-based PERMISSIONS.
// ---------------------------------------------------------------------------
// Role names correspond to the top-level sections extracted from
// user_role.roles by the gateway's signSession (e.g. 'admin.dishes.create'
// → 'admin'). See gateway/src/jwt.js.
//
// The special role 'super_admin' is granted to the super-admin user (PIN 5555
// in demo data) — it has unrestricted access to all tables.
//
// Permission shorthand:
//   FULL_ROLE  = roles CONTAINS 'super_admin' OR roles CONTAINS '<role>'
//   SELF       = $auth.sub = <string>id  (user can read their own record)
// ---------------------------------------------------------------------------

const SUPER_ADMIN_CHECK = "$auth.roles CONTAINS 'super_admin'";

function roleCheck(role) {
  return `${SUPER_ADMIN_CHECK} OR $auth.roles CONTAINS '${role}'`;
}

// 15 critical tables with their permission definitions.
// Each entry: { table, select, create, update, delete }
// A null value means "NONE" (deny for non-root).
const CRITICAL_TABLES = {
  // --- Auth & security ---
  user: {
    // Admin/HR can read all users; a user can read their own record.
    select: `${SUPER_ADMIN_CHECK} OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'hr' OR $auth.sub = <string>id`,
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },
  user_role: {
    select: roleCheck('admin'),
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },
  auth_permission: {
    select: roleCheck('admin'),
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },
  session_security: {
    select: roleCheck('admin'),
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },

  // --- HR / Payroll (sensitive: salary data) ---
  employee: {
    select: `${roleCheck('hr')} OR ${roleCheck('admin')}`,
    create: roleCheck('hr'),
    update: roleCheck('hr'),
    delete: roleCheck('hr'),
  },
  payroll_run: {
    select: `${roleCheck('hr')} OR ${roleCheck('admin')}`,
    create: roleCheck('hr'),
    update: roleCheck('hr'),
    delete: roleCheck('hr'),
  },
  payroll_snapshot: {
    select: `${roleCheck('hr')} OR ${roleCheck('admin')}`,
    create: roleCheck('hr'),
    update: roleCheck('hr'),
    delete: roleCheck('hr'),
  },
  time_entry: {
    // HR/Admin can read all; a user can read their own time entries.
    select: `${roleCheck('hr')} OR ${roleCheck('admin')} OR $auth.sub = user`,
    create: roleCheck('hr'),
    update: roleCheck('hr'),
    delete: roleCheck('hr'),
  },

  // --- Accounting (sensitive: financial journals) ---
  account_journal_entry: {
    select: `${roleCheck('accountant')} OR ${roleCheck('admin')}`,
    create: roleCheck('accountant'),
    update: roleCheck('accountant'),
    delete: roleCheck('admin'),
  },
  account_journal_line: {
    select: `${roleCheck('accountant')} OR ${roleCheck('admin')}`,
    create: roleCheck('accountant'),
    update: roleCheck('accountant'),
    delete: roleCheck('admin'),
  },

  // --- Integration credentials (sensitive: OAuth tokens, even encrypted) ---
  integration_oauth_credential: {
    select: roleCheck('admin'),
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },
  integration_oauth_state: {
    select: roleCheck('admin'),
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },

  // --- Payment configuration (gateway config now encrypted, but metadata sensitive) ---
  payment_type: {
    // All authenticated users can read (POS needs to show payment options).
    select: `${SUPER_ADMIN_CHECK} OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.roles CONTAINS 'cashier' OR $auth.roles CONTAINS 'waiter'`,
    create: roleCheck('admin'),
    update: roleCheck('admin'),
    delete: roleCheck('admin'),
  },

  // --- Payment webhooks (sensitive: payment status — could be forged) ---
  payment_webhook: {
    // Only the payments service (root) writes these. The SPA reads them to
    // poll for payment status. DENY create/update/delete for JWT sessions —
    // only root (payments service) can write.
    select: `${SUPER_ADMIN_CHECK} OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.roles CONTAINS 'cashier'`,
    create: 'NONE',
    update: 'NONE',
    delete: 'NONE',
  },

  // --- Tracking / audit (sensitive: user activity) ---
  tracking: {
    // Only the tracking-api service (root) writes. SPA cannot read tracking
    // data — that's admin-only.
    select: roleCheck('admin'),
    create: 'NONE',
    update: 'NONE',
    delete: 'NONE',
  },
};

// ---------------------------------------------------------------------------
// Parse DEFINE TABLE statements from latest.surql to preserve TYPE/SCHEMAFULL.
// ---------------------------------------------------------------------------

function parseTableDefinitions() {
  // Scan ALL .surql migration files (not just latest.surql) for DEFINE TABLE
  // statements. latest.surql is a snapshot that may lag behind individual
  // migrations — tables added in newer migrations (e.g. integration_oauth_*
  // from 2026_08_03) would be missed if we only read latest.surql.
  const migrationsDir = path.resolve(__dirname, '..');
  const surqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.surql'))
    .sort();
  const defs = {};
  for (const file of surqlFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const line of content.split('\n')) {
      // Match various DEFINE TABLE formats:
      //   DEFINE TABLE name TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
      //   DEFINE TABLE name TYPE ANY SCHEMALESS PERMISSIONS FULL;
      //   DEFINE TABLE name SCHEMALESS;                              (no TYPE, no PERMISSIONS)
      //   DEFINE TABLE name SCHEMAFULL;                              (no TYPE, no PERMISSIONS)
      //   DEFINE TABLE name TYPE ANY SCHEMALESS;                     (no PERMISSIONS)
      const m = line.match(
        /^DEFINE TABLE\s+(\w+)\s+(?:(TYPE\s+\w+)\s+)?(SCHEMA(?:FULL|LESS))(?:\s+PERMISSIONS\s+(NONE|FULL|FOR.*?))?\s*;/
      );
      if (m) {
        const [, name, typePart, schemaPart] = m;
        const type = typePart ? typePart.trim() : 'TYPE ANY';
        defs[name] = { type, schema: schemaPart };
      }
    }
  }
  return defs;
}

/**
 * Fetch all table names from the live database (via INFO FOR DB). This catches
 * tables that were created dynamically (not via a DEFINE TABLE migration) —
 * e.g. session_security, which the app auto-creates on first write.
 */
async function fetchLiveTableNames(db) {
  const result = await db.query('INFO FOR DB;');
  const info = Array.isArray(result) ? result[0] : result;
  // INFO FOR DB returns { tables: { name: {...}, ... }, ... }
  const tables = info?.tables || {};
  return Object.keys(tables);
}

function buildPermissionsClause(table) {
  const critical = CRITICAL_TABLES[table];
  if (!critical) {
    // Non-critical table: full access for any authenticated user.
    return 'PERMISSIONS FULL';
  }
  // Critical table: specific per-operation permissions.
  const parts = [];
  for (const op of ['select', 'create', 'update', 'delete']) {
    const rule = critical[op];
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

  const parsedDefs = parseTableDefinitions();
  console.log(`Parsed ${Object.keys(parsedDefs).length} table definitions from latest.surql.`);

  // Fetch live table names — catches dynamically created tables not in any
  // migration (e.g. session_security). For these, we use a default definition.
  let liveNames = [];
  try {
    liveNames = await fetchLiveTableNames(db);
    console.log(`Live database has ${liveNames.length} tables.`);
  } catch (err) {
    console.warn('Could not fetch live table names (INFO FOR DB failed):', err.message);
    console.warn('Falling back to parsed definitions only.');
  }

  // Merge: parsed definitions + live-only tables (with defaults).
  const allNames = [...new Set([...Object.keys(parsedDefs), ...liveNames])];
  const tableDefs = {};
  for (const name of allNames) {
    tableDefs[name] = parsedDefs[name] || { type: 'TYPE ANY', schema: 'SCHEMALESS' };
  }

  console.log(`Total tables to redefine: ${allNames.length}.`);
  console.log(`  Critical (role-restricted): ${Object.keys(CRITICAL_TABLES).length}`);
  console.log(`  Non-critical (PERMISSIONS FULL): ${allNames.length - Object.keys(CRITICAL_TABLES).length}`);
  console.log('');

  let redefined = 0;
  let failed = 0;

  for (const name of allNames) {
    const { type, schema } = tableDefs[name];
    const permsClause = buildPermissionsClause(name);
    const isCritical = !!CRITICAL_TABLES[name];

    if (DRY_RUN) {
      console.log(`  DRY-RUN  ${name.padEnd(35)} ${type} ${schema} ${permsClause.slice(0, 60)}...`);
      redefined++;
      continue;
    }

    try {
      const ddl = `DEFINE TABLE ${name} ${type} ${schema} ${permsClause};`;
      await db.query(ddl);
      console.log(`  ${isCritical ? 'CRITICAL' : 'FULL    '}  ${name.padEnd(35)} ${permsClause.slice(0, 50)}${permsClause.length > 50 ? '...' : ''}`);
      redefined++;
    } catch (err) {
      console.error(`  FAIL     ${name.padEnd(35)} ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Redefined: ${redefined}, failed: ${failed}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}.`);

  if (!DRY_RUN && failed === 0) {
    console.log('');
    console.log('RBAC permissions applied. To activate:');
    console.log('  1. Set GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true in gateway/.env');
    console.log('  2. Restart the gateway service');
    console.log('  3. The SPA will now authenticate with the session JWT');
    console.log('  4. SurrealDB enforces PERMISSIONS on JWT sessions (root bypasses)');
    console.log('  5. Test every screen — if any breaks, the PERMISSIONS need adjusting');
  }

  await db.close();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
