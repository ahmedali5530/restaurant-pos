'use strict';

/**
 * Prune aged terminal-sync log tables to reclaim SurrealDB space.
 *
 * Deletes rows older than RETENTION_DAYS (default 7) from:
 *   sync_event, sync_accepted_operation, sync_conflict, sync_number_reservation
 *
 * Never touches: sync_event_seq, sync_number_counter, sync_terminal,
 * sync_branch, sync_cloud_cursor, sync_catalog_down_cursor, sync_cursor.
 *
 * Usage:
 *   DRY_RUN=1 bun migrations/scripts/prune-sync-tables.cjs
 *   CONFIRM=1 bun migrations/scripts/prune-sync-tables.cjs
 *   CONFIRM=1 RETENTION_DAYS=14 bun migrations/scripts/prune-sync-tables.cjs
 *
 * Env:
 *   SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS
 *   RETENTION_DAYS=7   keep rows newer than this many days
 *   BATCH_SIZE=2000    rows deleted per DELETE loop
 *   DRY_RUN=1          count only
 *   CONFIRM=1          required to write
 *
 * Offline tills: a terminal offline longer than retention that still holds an
 * old pull cursor may miss pruned sync_event rows. Recovery is Settings →
 * Reload cache (snapshot jumps the cursor to the high watermark). Same class
 * of gap as the 1d operational snapshot window.
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
const RETENTION_DAYS = Math.max(1, Number(process.env.RETENTION_DAYS || 7) || 7);
const BATCH_SIZE = Math.max(100, Number(process.env.BATCH_SIZE || 2000) || 2000);

/** Age-prunable terminal-sync log tables (created_at required). */
const PRUNE_TABLES = [
  'sync_event',
  'sync_accepted_operation',
  'sync_conflict',
  'sync_number_reservation',
];

if (!DB_USER || !DB_PASS) {
  console.error(
    'ERROR: SURREAL_USER and SURREAL_PASS env vars are required.',
  );
  process.exit(1);
}

if (!DRY_RUN && !CONFIRM) {
  console.error(
    'Refusing to prune without CONFIRM=1. Use DRY_RUN=1 to preview counts.',
  );
  process.exit(1);
}

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

function deletedCountFromResult(result) {
  // DELETE … RETURN BEFORE / LIMIT may return an array of removed rows.
  if (!Array.isArray(result) || result.length === 0) return 0;
  const top = result[0];
  if (Array.isArray(top)) return top.length;
  if (top && typeof top === 'object' && top.count != null) {
    return Number(top.count);
  }
  return 0;
}

async function staleCount(db, table, cutoffIso) {
  try {
    const result = await db.query(
      `SELECT count() FROM ${table} WHERE created_at < $cutoff GROUP ALL`,
      { cutoff: cutoffIso },
    );
    return countFromResult(result);
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}

async function pruneTable(db, table, cutoffIso) {
  let total = 0;
  for (;;) {
    let result;
    try {
      result = await db.query(
        `DELETE ${table} WHERE created_at < $cutoff LIMIT $batch RETURN BEFORE`,
        { cutoff: cutoffIso, batch: BATCH_SIZE },
      );
    } catch (error) {
      if (isMissingTable(error)) {
        console.log(`  skip missing table ${table}`);
        return 0;
      }
      throw error;
    }
    const n = deletedCountFromResult(result);
    total += n;
    if (n < BATCH_SIZE) break;
    console.log(`  ${table}: deleted ${total} so far…`);
  }
  return total;
}

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  console.log(
    `${DRY_RUN ? 'DRY RUN' : 'PRUNING'} sync log tables older than ${RETENTION_DAYS}d`,
  );
  console.log(`  cutoff: ${cutoffIso}`);
  console.log(`  target: ${DB_NS}/${DB_NAME} @ ${DB_URL}`);
  console.log(
    '  keeps: sync_event_seq, sync_number_counter, sync_terminal, sync_branch, cursors',
  );

  const counts = {};
  for (const table of PRUNE_TABLES) {
    counts[table] = await staleCount(db, table, cutoffIso);
    console.log(`  ${table}: ${counts[table]} stale`);
  }

  if (DRY_RUN) {
    console.log('No writes performed.');
    await db.close();
    return;
  }

  for (const table of PRUNE_TABLES) {
    const deleted = await pruneTable(db, table, cutoffIso);
    console.log(`  ${table}: deleted ${deleted}`);
  }

  console.log(
    'Done. Tills offline longer than retention may need Settings → Reload cache.',
  );
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
