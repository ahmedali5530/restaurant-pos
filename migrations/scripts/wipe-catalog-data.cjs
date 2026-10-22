'use strict';

/**
 * Delete FOH catalog / dish data on a branch (or HQ) Surreal DB so Sync now can
 * re-download a clean copy from cloud master. Users and settings are kept by
 * default so you can still log in.
 *
 * Does NOT delete orders — run wipe-order-data.cjs first if order rows still
 * reference menu_item / tax / payment_type ids.
 *
 * Usage:
 *   DRY_RUN=1 bun migrations/scripts/wipe-catalog-data.cjs
 *   CONFIRM=1 bun migrations/scripts/wipe-catalog-data.cjs
 *
 * Env:
 *   SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS
 *   CONFIRM=1          required to write
 *   DRY_RUN=1          count only
 *   INCLUDE_USERS=1    also delete `user` (you will need an admin after sync)
 *   INCLUDE_SETTINGS=1 also delete `setting`
 *   SKIP_CURSORS=1     leave sync_catalog_down_cursor alone (not recommended)
 *
 * After a live wipe on a branch:
 *   1. Restart sync-service (or wait for next poll) with SYNC_DISTRIBUTION_MODE=full
 *   2. Settings → Sync catalog now
 *   3. Settings → Reload cache (and/or delete IndexedDB `posr-terminal`)
 */

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONFIRM = process.env.CONFIRM === '1';
const INCLUDE_USERS = process.env.INCLUDE_USERS === '1';
const INCLUDE_SETTINGS = process.env.INCLUDE_SETTINGS === '1';
const SKIP_CURSORS = process.env.SKIP_CURSORS === '1';

if (!DB_USER || !DB_PASS) {
  console.error(
    'ERROR: SURREAL_USER and SURREAL_PASS env vars are required.',
  );
  process.exit(1);
}

if (!DRY_RUN && !CONFIRM) {
  console.error(
    'Refusing to wipe without CONFIRM=1. Use DRY_RUN=1 to preview counts.',
  );
  process.exit(1);
}

/**
 * Child / edge tables first, then parents. Aligns with sync-service
 * DEFAULT_DOWNLOAD_TABLES plus local-only dish links (recipes, menu taxes).
 */
const CATALOG_CHILD_TABLES = [
  'menu_item_modifier_group',
  'menu_menu_item_tax',
  'menu_menu_item',
  'menu_item_recipe',
  'workflow_stage',
  'floor_table',
];

const CATALOG_CORE_TABLES = [
  'modifier',
  'modifier_group',
  'menu_item',
  'category',
  'menu',
  'kitchen',
  'workflow',
  'floor',
  'order_type',
  'payment_type',
  'tax',
  'extra',
  'discount',
  'discount_reason',
  'coupon',
  'printer',
  // Permission roles (user.user_role). Wiped even when users are kept so Sync
  // now can replace seed roles/modules from HQ.
  'user_role',
];

const CATALOG_CURSOR_TABLES = [
  'sync_catalog_down_cursor',
];

function firstRow(result) {
  if (!Array.isArray(result) || result.length === 0) return undefined;
  const top = result[0];
  if (Array.isArray(top)) return top[0];
  return top && typeof top === 'object' ? top : undefined;
}

function countFromResult(result) {
  const row = firstRow(result);
  const value = row?.count ?? row?.['count()'];
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function isMissingTable(error) {
  const message = String(error?.message || error || '');
  return /does not exist|not found|unknown table|no such table/i.test(message);
}

async function tableCount(db, table) {
  try {
    const result = await db.query(`SELECT count() FROM ${table} GROUP ALL`);
    return countFromResult(result);
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}

async function deleteTable(db, table) {
  try {
    await db.query(`DELETE FROM ${table}`);
    return true;
  } catch (error) {
    if (isMissingTable(error)) {
      console.log(`  skip missing table ${table}`);
      return false;
    }
    throw error;
  }
}

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  const tables = [
    ...CATALOG_CHILD_TABLES,
    ...CATALOG_CORE_TABLES,
    ...(INCLUDE_SETTINGS ? ['setting'] : []),
    ...(INCLUDE_USERS ? ['user'] : []),
    ...(SKIP_CURSORS ? [] : CATALOG_CURSOR_TABLES),
  ];

  console.log(
    `${DRY_RUN ? 'DRY RUN' : 'WIPING'} catalog/dish data on ${DB_NS}/${DB_NAME} @ ${DB_URL}`,
  );
  console.log(
    `  keep users=${INCLUDE_USERS ? 'no' : 'yes'}  keep settings=${INCLUDE_SETTINGS ? 'no' : 'yes'}  reset down-cursors=${SKIP_CURSORS ? 'no' : 'yes'}`,
  );

  const counts = {};
  for (const table of tables) {
    counts[table] = await tableCount(db, table);
    console.log(`  ${table}: ${counts[table]}`);
  }

  if (DRY_RUN) {
    console.log('No writes performed.');
    await db.close();
    return;
  }

  for (const table of tables) {
    await deleteTable(db, table);
    console.log(`  deleted ${table}`);
  }

  console.log('Done.');
  console.log('Next on this branch: Sync catalog now, then Reload cache (clear IndexedDB posr-terminal if needed).');
  if (!INCLUDE_USERS) {
    console.log('Users were kept. After sync, cloud users may merge on top of local logins.');
  }
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
