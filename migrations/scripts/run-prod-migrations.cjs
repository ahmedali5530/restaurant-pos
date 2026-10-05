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
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
if (!DB_USER || !DB_PASS) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS env vars are required. The previous root/root fallback was removed for security — set them explicitly (must match the existing SurrealDB root user created on first start).');
  process.exit(1);
}
const SKIP_BACKFILL = process.env.SKIP_BACKFILL === '1';

const REPO_ROOT = process.env.REPO_ROOT
  || path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  || path.join(REPO_ROOT, 'migrations');

/**
 * Full-schema snapshot used to bootstrap a brand-new database. It provides the
 * base schema that the earliest plan entry assumes already exists. The snapshot
 * is schema-only (no seed rows, no changefeeds), so the plan still runs after it
 * to add those and to record migration state. After that first pass, subsequent
 * runs only apply newly added migrations.
 */
const BASELINE_FILE = process.env.BASELINE_FILE || 'latest.surql';

/** Optional demo/seed data loaded only when bootstrapping a brand-new database. */
const DEMO_DATA_FILE = process.env.DEMO_DATA_FILE || 'demo-data.surql';
const SEED_DEMO_DATA = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.SEED_DEMO_DATA || '').trim().toLowerCase()
);

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
  { id: '2026_08_18_flexible_payroll', file: '2026_08_18_flexible_payroll.surql' },
  { id: '2026_08_22_order_list_indexes', file: '2026_08_22_order_list_indexes.surql' },
  { id: '2026_08_30_hot_path_indexes', file: '2026_08_30_hot_path_indexes.surql' },
  { id: '2026_08_27_revoked_session_store', file: '2026_08_27_revoked_session_store.surql' },
  { id: '2026_08_27_payment_credential_encryption', file: '2026_08_27_payment_credential_encryption.surql' },
  {
    id: '2026_08_27_payment_credential_encryption_backfill',
    backfill: 'encrypt-existing-payment-credentials.cjs',
  },
  { id: '2026_08_28_audit_log_events', file: '2026_08_28_audit_log_events.surql' },
  { id: '2026_08_28_security_alerts', file: '2026_08_28_security_alerts.surql' },
  {
    id: '2026_08_28_security_alerts_access_backfill',
    backfill: 'backfill-security-alerts-access.cjs',
  },
  { id: '2026_09_04_terminal_sync', file: '2026_09_04_terminal_sync.surql' },
  { id: '2026_09_05_delivery_menu_function', file: '2026_09_05_delivery_menu_function.surql' },
  { id: '2026_09_06_sync_schemaless_reset', file: '2026_09_06_sync_schemaless_reset.surql' },
  { id: '2026_09_06_order_sync_ownership_fields', file: '2026_09_06_order_sync_ownership_fields.surql' },
  { id: '2026_09_12_refund_print_settings', file: '2026_09_12_refund_print_settings.surql' },
  { id: '2026_09_18_printer_print_mode_paper_width', file: '2026_09_18_printer_print_mode_paper_width.surql' },
  { id: '2026_09_19_order_invoice_display', file: '2026_09_19_order_invoice_display.surql' },
  { id: '2026_09_20_day_closing_shift', file: '2026_09_20_day_closing_shift.surql' },
  { id: '2026_09_24_foh_changefeed', file: '2026_09_24_foh_changefeed.surql' },
  { id: '2026_09_24_foh_changefeed_fiscal', file: '2026_09_24_foh_changefeed_fiscal.surql' },
  { id: '2026_09_26_day_closing_drawer', file: '2026_09_26_day_closing_drawer.surql' },
  { id: '2026_09_26_catalog_down_cursor', file: '2026_09_26_catalog_down_cursor.surql' },
  { id: '2026_09_27_hq_catalog_publish', file: '2026_09_27_hq_catalog_publish.surql' },
  { id: '2026_09_28_catalog_branch_override', file: '2026_09_28_catalog_branch_override.surql' },
  { id: '2026_09_29_branch_owned_catalog_and_user_branches', file: '2026_09_29_branch_owned_catalog_and_user_branches.surql' },
];

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

/**
 * Table names present in the target database. `INFO FOR DB` returns a single
 * object shaped like `{ tables: { ... } }`; a brand-new database has none.
 */
async function listTables(db) {
  const result = await db.query('INFO FOR DB');
  const info = Array.isArray(result) ? result[0] : result;
  return Object.keys((info && info.tables) || {});
}

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

async function importBaseline(db) {
  const baselinePath = path.join(MIGRATIONS_DIR, BASELINE_FILE);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Fresh database but baseline file not found: ${baselinePath}`);
  }
  console.log(`Fresh database detected — importing full schema baseline: ${BASELINE_FILE}`);
  await applySurql(db, baselinePath);
}

async function importDemoData(db) {
  const demoPath = path.join(MIGRATIONS_DIR, DEMO_DATA_FILE);
  if (!fs.existsSync(demoPath)) {
    console.warn(`SEED_DEMO_DATA is set but ${DEMO_DATA_FILE} was not found; skipping demo data.`);
    return;
  }
  console.log(`Seeding demo data: ${DEMO_DATA_FILE}`);
  await applySurql(db, demoPath);
}

async function main() {
  console.log('=== Production migrations ===');
  console.log(`  plan entries: ${MIGRATION_PLAN.length}`);
  console.log(`  migrations dir: ${MIGRATIONS_DIR}`);

  let db = await connectWithRetry();

  const existingTables = await listTables(db);
  const isFreshDatabase = existingTables.length === 0;
  if (isFreshDatabase) {
    await importBaseline(db);
  } else {
    console.log(`Existing database detected (${existingTables.length} tables) — applying pending migrations.`);
  }

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

  if (isFreshDatabase && SEED_DEMO_DATA) {
    await importDemoData(db);
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
