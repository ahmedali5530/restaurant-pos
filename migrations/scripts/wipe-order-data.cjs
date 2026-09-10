'use strict';

/**
 * Delete POS order operational data so a terminal can start from a clean slate
 * after offline-sync testing. Catalog, users, inventory, and settings are kept.
 *
 * Usage:
 *   CONFIRM=1 bun migrations/scripts/wipe-order-data.cjs
 *   DRY_RUN=1 bun migrations/scripts/wipe-order-data.cjs
 *
 * Env:
 *   SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS
 *   CONFIRM=1     required to write
 *   DRY_RUN=1     count only
 *   SKIP_SYNC=1   leave gateway sync tables alone
 *   SKIP_CLOSING=1 leave day_closing and tip distribution
 *
 * After a live wipe, clear each terminal's local WASM store (IndexedDB
 * `posr-terminal`) so stale outbox rows / sequence counters / conflicts cannot
 * push corrupted orders back. DevTools → Application → IndexedDB → delete
 * `posr-terminal`, then hard-refresh. A soft refresh is not enough if the
 * local next_sequence is still ahead of the wiped server.
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
const SKIP_SYNC = process.env.SKIP_SYNC === '1';
const SKIP_CLOSING = process.env.SKIP_CLOSING === '1';

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

/** Child tables first so leftover record<order> links do not linger. */
const ORDER_GRAPH_TABLES = [
  'order_item_kitchen',
  'order_item',
  'order_extras',
  'order_meta',
  'order_coupon',
  'order_discount',
  'order_tax',
  'order_payment',
  'order_merge',
  'order_split',
  'order_void',
  'order_refund',
  'order_print',
  'coupon_redemption',
  'integration_order_fiscal',
  'payment_webhook',
  'order',
];

const CLOSING_TABLES = [
  'tip_distribution_user_share',
  'tip_distribution',
  'day_closing',
];

const SYNC_TABLES = [
  'sync_financial_event',
  'sync_conflict',
  'sync_event',
  'sync_operation',
  'sync_aggregate_version',
  'sync_number_reservation',
  'sync_number_counter',
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
    ...ORDER_GRAPH_TABLES,
    ...(SKIP_CLOSING ? [] : CLOSING_TABLES),
    ...(SKIP_SYNC ? [] : SYNC_TABLES),
  ];

  console.log(
    `${DRY_RUN ? 'DRY RUN' : 'WIPING'} order-related data on ${DB_NS}/${DB_NAME} @ ${DB_URL}`,
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

  try {
    await db.query(`UPDATE order_number_seq SET value = 0`);
    console.log('  reset order_number_seq.value = 0');
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    console.log('  skip missing table order_number_seq');
  }

  try {
    await db.query(
      `UPDATE floor_table SET is_locked = false, locked_at = NONE, locked_by = NONE`,
    );
    console.log('  unlocked floor_table rows');
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    console.log('  skip floor_table unlock');
  }

  if (!SKIP_SYNC) {
    try {
      await db.query(
        `UPSERT sync_cursor:global SET value = 0, updated_at = time::now()`,
      );
      console.log('  reset sync_cursor:global');
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      console.log('  skip missing table sync_cursor');
    }

    try {
      await db.query(
        `UPDATE sync_terminal SET last_sequence = 0, last_seen_at = time::now()`,
      );
      console.log('  reset sync_terminal.last_sequence');
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      console.log('  skip missing table sync_terminal');
    }
  }

  console.log('Done. Clear each browser IndexedDB posr-terminal store before logging in again.');
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
