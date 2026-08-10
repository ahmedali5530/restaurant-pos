'use strict';

/**
 * Production migration runner for docker-compose.prod.yml.
 *
 * Applies pending .surql files (tracked in `_schema_migration`) then optional
 * Node backfills. Safe to re-run: already-applied migrations are skipped.
 *
 * Env:
 *   SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS
 *   REPO_ROOT / MIGRATIONS_DIR
 *   SKIP_BACKFILL=1 — skip Node backfill scripts
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://surrealdb:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER || 'root';
const DB_PASS = process.env.SURREAL_PASS || 'root';
const SKIP_BACKFILL = process.env.SKIP_BACKFILL === '1';

const REPO_ROOT = process.env.REPO_ROOT
  || path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  || path.join(REPO_ROOT, 'migrations');

/**
 * Ordered list of schema migrations + optional post-backfills.
 * Add new entries at the end when shipping schema changes.
 */
const MIGRATION_PLAN = [
  { id: '2026_07_17_inventory_lifecycle', file: '2026_07_17_inventory_lifecycle.surql' },
  { id: '2026_07_17_inventory_ledger', file: '2026_07_17_inventory_ledger.surql' },
  { id: '2026_07_18_inventory_phases_5_9', file: '2026_07_18_inventory_phases_5_9.surql' },
  { id: '2026_07_18_location_stock_cutover', file: '2026_07_18_location_stock_cutover.surql' },
  {
    id: '2026_07_18_location_refs_backfill',
    backfill: 'backfill-location-refs.cjs',
  },
  { id: '2026_07_18_purchase_landed_cost', file: '2026_07_18_purchase_landed_cost.surql' },
  { id: '2026_07_20_fix_purchase_extras', file: '2026_07_20.surql'},
  { id: '2026_07_23_purchase_order_approval', file: '2026_07_23_purchase_order_approval.surql' },
  { id: '2026_07_24_order_print', file: '2026_07_24_order_print.surql' },
  { id: '2026_07_28_kitchen_reconciliation_location', file: '2026_07_28_kitchen_reconciliation_location.surql' },
  {
    id: '2026_07_26_access_modules_backfill',
    backfill: 'backfill-access-modules.cjs',
  },
  {
    id: '2026_07_30_ledger_business_date_tz',
    backfill: 'backfill-ledger-business-date.cjs',
  },
  { id: '2026_08_03_external_accounting_integration', file: '2026_08_03_external_accounting_integration.surql' },
  { id: '2026_08_06_order_number_seq', file: '2026_08_06_order_number_seq.surql' },
  { id: '2026_08_08_order_discounts', file: '2026_08_08_order_discounts.surql' },
  {
    id: '2026_08_09_payment_type_discounts_backfill',
    backfill: 'backfill-payment-type-discounts.cjs',
  },
];

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripComments = (sql) =>
  sql
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n')
    .trim();

async function connectWithRetry(maxAttempts = 30) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const db = new Surreal();
    try {
      await db.connect(DB_URL);
      await db.signin({ username: DB_USER, password: DB_PASS });
      await db.use({ namespace: DB_NS, database: DB_NAME });
      console.log(`Connected to ${DB_URL} (attempt ${attempt})`);
      return db;
    } catch (err) {
      lastErr = err;
      console.warn(`Surreal not ready (attempt ${attempt}/${maxAttempts}): ${err.message || err}`);
      try { await db.close(); } catch { /* ignore */ }
      await sleep(2000);
    }
  }
  throw lastErr || new Error('Could not connect to SurrealDB');
}

async function ensureMigrationTable(db) {
  await db.query(`
    DEFINE TABLE IF NOT EXISTS _schema_migration TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
    DEFINE FIELD OVERWRITE name ON _schema_migration TYPE string PERMISSIONS FULL;
    DEFINE FIELD OVERWRITE applied_at ON _schema_migration TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
    DEFINE FIELD OVERWRITE note ON _schema_migration TYPE option<string> PERMISSIONS FULL;
    DEFINE INDEX IF NOT EXISTS _schema_migration_name ON _schema_migration FIELDS name UNIQUE;
  `);
}

async function isApplied(db, id) {
  const found = rows(
    await db.query(`SELECT name FROM _schema_migration WHERE name = $id LIMIT 1`, { id })
  );
  return found.length > 0;
}

async function markApplied(db, id, note) {
  await db.query(
    `CREATE _schema_migration SET name = $id, applied_at = time::now(), note = $note`,
    { id, note: note || null }
  );
}

async function applySurql(db, filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const sql = stripComments(raw);
  if (!sql) {
    console.log(`  (empty after comments) skip ${path.basename(filePath)}`);
    return;
  }
  await db.query(sql);
}

function runBackfill(scriptName) {
  const scriptPath = path.join(MIGRATIONS_DIR, 'scripts', scriptName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Backfill script not found: ${scriptPath}`);
  }
  console.log(`  Running backfill ${scriptName}...`);
  const result = spawnSync(process.execPath, [scriptPath], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Backfill failed: ${scriptName} (exit ${result.status})`);
  }
}

async function main() {
  console.log('=== Production migrations ===');
  console.log(`  plan entries: ${MIGRATION_PLAN.length}`);
  console.log(`  migrations dir: ${MIGRATIONS_DIR}`);

  let db = await connectWithRetry();
  await ensureMigrationTable(db);

  for (const step of MIGRATION_PLAN) {
    if (await isApplied(db, step.id)) {
      console.log(`[skip] ${step.id} (already applied)`);
      continue;
    }

    console.log(`[apply] ${step.id}`);

    if (step.file) {
      const filePath = path.join(MIGRATIONS_DIR, step.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file missing: ${filePath}`);
      }
      await applySurql(db, filePath);
      await markApplied(db, step.id, step.file);
      console.log(`[done]  ${step.id}`);
    } else if (step.backfill) {
      if (SKIP_BACKFILL) {
        console.log(`[skip] ${step.id} (SKIP_BACKFILL=1)`);
        continue;
      }
      await db.close();
      runBackfill(step.backfill);
      db = await connectWithRetry(10);
      await markApplied(db, step.id, step.backfill);
      console.log(`[done]  ${step.id}`);
    }
  }

  try {
    await db.close();
  } catch { /* ignore */ }

  console.log('=== Migrations complete ===');
}

main().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
