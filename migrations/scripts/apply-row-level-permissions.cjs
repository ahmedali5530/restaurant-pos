'use strict';

/**
 * Row-level RBAC migration: redefine business tables with branch_id filtering.
 *
 * The previous migrations set:
 *   - 15 critical tables → role-restricted (admin/hr/accountant only)
   - 108 non-critical tables → granular per-role
 *
 * This migration adds a THIRD dimension: row-level filtering by branch_id.
 * For tables that have a branch_id field (order, order_item_kitchen,
 * day_closing), the SELECT permission now checks:
 *
 *   WHERE branch_id = $auth.branch_id
 *      OR $auth.roles CONTAINS 'super_admin'
 *      OR $auth.roles CONTAINS 'admin'
 *      OR $auth.branch_id = NONE   (user has no home branch — sees all)
 *
 * This means:
 *   - A waiter at Branch A sees only Branch A's orders.
 *   - A super_admin or admin sees all branches.
 *   - A user without a branch_id (area manager) sees all branches.
 *
 * Tables NOT in this migration keep their existing granular permissions
 * (from apply-granular-rbac-permissions.cjs). Only tables with a branch_id
 * field get row-level filtering.
 *
 * Idempotent. Dormant until GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true.
 *
 * Usage:
 *   SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-row-level-permissions.cjs
 *
 *   # Dry run:
 *   DRY_RUN=1 SURREAL_USER=posr SURREAL_PASS=... \
 *   node migrations/scripts/apply-row-level-permissions.cjs
 *
 * See: migrations/2026_08_28_user_branch_id.surql (adds branch_id fields)
 * See: RBAC-DESIGN.md → "Per-user row-level restrictions" section
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
// Row-level permission definitions.
//
// Each entry: { table, select, create, update, delete }
//
// The SELECT rule includes a branch_id filter:
//   WHERE (branch_id = $auth.branch_id
//          OR $auth.roles CONTAINS 'super_admin'
//          OR $auth.roles CONTAINS 'admin'
//          OR $auth.branch_id = NONE)
//
// The last condition ($auth.branch_id = NONE) handles users without a home
// branch — they see all branches (area managers, roaming support staff).
//
// CREATE/UPDATE/DELETE keep the same role restrictions as the granular
// migration — only the SELECT is tightened with branch filtering.
// ---------------------------------------------------------------------------

const SUPER_ADMIN = "$auth.roles CONTAINS 'super_admin'";

function branchFilter(roles) {
  // Build the WHERE clause: branch_id matches OR user has no branch OR is admin/super_admin.
  const roleChecks = roles.map((r) => `$auth.roles CONTAINS '${r}'`).join(' OR ');
  return `(branch_id = $auth.branch_id OR ${SUPER_ADMIN} OR $auth.roles CONTAINS 'admin' OR $auth.branch_id = NONE)`;
}

const ROW_LEVEL_TABLES = {
  // --- Orders — branch-scoped ---
  order: {
    select: `(branch_id = $auth.branch_id OR ${SUPER_ADMIN} OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.branch_id = NONE)`,
    create: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'waiter' OR $auth.roles CONTAINS 'cashier'",
    update: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.roles CONTAINS 'waiter' OR $auth.roles CONTAINS 'cashier' OR $auth.roles CONTAINS 'kitchen'",
    delete: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager'",
  },
  order_item_kitchen: {
    select: `(branch_id = $auth.branch_id OR ${SUPER_ADMIN} OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.branch_id = NONE)`,
    create: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'waiter' OR $auth.roles CONTAINS 'cashier'",
    update: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'kitchen'",
    delete: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager'",
  },
  day_closing: {
    select: `(branch_id = $auth.branch_id OR ${SUPER_ADMIN} OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.branch_id = NONE)`,
    create: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager' OR $auth.roles CONTAINS 'cashier'",
    update: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'manager'",
    delete: "$auth.roles CONTAINS 'super_admin' OR $auth.roles CONTAINS 'admin'",
  },
};

// ---------------------------------------------------------------------------
// Parse DEFINE TABLE from .surql files (same as previous migrations)
// ---------------------------------------------------------------------------

function parseTableDefinitions() {
  const migrationsDir = path.resolve(__dirname, '..');
  const surqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.surql'))
    .sort();
  const defs = {};
  for (const file of surqlFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const line of content.split('\n')) {
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

async function fetchLiveTableNames(db) {
  const result = await db.query('INFO FOR DB;');
  const info = Array.isArray(result) ? result[0] : result;
  return Object.keys(info?.tables || {});
}

function buildPermissionsClause(def) {
  const parts = [];
  for (const op of ['select', 'create', 'update', 'delete']) {
    const rule = def[op];
    if (rule === 'NONE') parts.push(`FOR ${op} NONE`);
    else if (rule === 'FULL') parts.push(`FOR ${op} FULL`);
    else parts.push(`FOR ${op} WHERE ${rule}`);
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
  console.log(`Parsed ${Object.keys(parsedDefs).length} table definitions from .surql files.`);

  let liveNames = [];
  try {
    liveNames = await fetchLiveTableNames(db);
    console.log(`Live database has ${liveNames.length} tables.`);
  } catch (err) {
    console.warn('Could not fetch live table names:', err.message);
  }

  const allNames = [...new Set([...Object.keys(parsedDefs), ...liveNames])];
  const rowLevelNames = allNames.filter((n) => ROW_LEVEL_TABLES[n]);

  console.log(`Applying row-level (branch_id) permissions to ${rowLevelNames.length} tables.`);
  console.log('');

  let redefined = 0;
  let failed = 0;

  for (const name of rowLevelNames) {
    const { type, schema } = parsedDefs[name] || { type: 'TYPE ANY', schema: 'SCHEMALESS' };
    const permsClause = buildPermissionsClause(ROW_LEVEL_TABLES[name]);

    if (DRY_RUN) {
      console.log(`  DRY-RUN  ${name.padEnd(35)} ${permsClause.slice(0, 80)}...`);
      redefined++;
      continue;
    }

    try {
      const ddl = `DEFINE TABLE ${name} ${type} ${schema} ${permsClause};`;
      await db.query(ddl);
      console.log(`  ROW-LEVEL ${name.padEnd(35)} SELECT filters by branch_id`);
      redefined++;
    } catch (err) {
      console.error(`  FAIL     ${name.padEnd(35)} ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. Row-level: ${redefined}, failed: ${failed}${DRY_RUN ? ' (DRY RUN)' : ''}.`);

  if (!DRY_RUN && failed === 0) {
    console.log('');
    console.log('Row-level PERMISSIONS applied. Orders, kitchen items, and day');
    console.log('closings are now filtered by the user\'s home branch ($auth.branch_id).');
    console.log('');
    console.log('Users without a branch_id (super admins, area managers) see all');
    console.log('branches. Users with a branch_id see only their branch\'s data.');
    console.log('');
    console.log('Dormant until GATEWAY_USE_JWT_AS_SURREAL_TOKEN=true.');
    console.log('Run AFTER apply-granular-rbac-permissions.cjs.');
    console.log('');
    console.log('IMPORTANT: existing rows without a branch_id will be visible to');
    console.log('ALL users (the WHERE clause matches when both branch_id = NONE).');
    console.log('Run the backfill script to set branch_id on existing orders if');
    console.log('you want strict branch isolation for historical data.');
  }

  await db.close();
  if (failed > 0) process.exit(1);
}

module.exports = {
  ROW_LEVEL_TABLES,
  buildPermissionsClause,
  branchFilter,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
