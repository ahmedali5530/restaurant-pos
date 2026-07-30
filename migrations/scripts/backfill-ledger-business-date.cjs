'use strict';

/**
 * Correct inventory_ledger.business_date that was written with UTC toISOString()
 * (off-by-one vs app timezone, e.g. Asia/Karachi UTC+5).
 *
 * Idempotent: only updates rows where stored business_date differs from the
 * app-timezone calendar date of created_at.
 *
 * Env:
 *   SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS
 *   APP_TIMEZONE / VITE_APP_TIMEZONE (default Asia/Karachi)
 *   DRY_RUN=1 — count only, do not write
 */

const WS = require('ws');
const { Surreal } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER || 'root';
const DB_PASS = process.env.SURREAL_PASS || 'root';
const APP_TZ = process.env.APP_TIMEZONE || process.env.VITE_APP_TIMEZONE || 'Asia/Karachi';
const DRY_RUN = process.env.DRY_RUN === '1';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const toJsDate = (value) => {
  if (value == null) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value === 'object' && value.seconds != null) {
    return new Date(Number(value.seconds) * 1000);
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return new Date(Number(value));
  }
  return new Date(String(value));
};

/** yyyy-MM-dd in APP_TZ — never UTC toISOString. */
const businessDateFrom = (createdAt) => {
  const d = toJsDate(createdAt);
  if (Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
};

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  console.log(`Connected. Correcting inventory_ledger.business_date for tz=${APP_TZ}${DRY_RUN ? ' (DRY_RUN)' : ''}`);

  const ledgerRows = rows(
    await db.query(`SELECT id, created_at, business_date FROM inventory_ledger`)
  );

  let checked = 0;
  let mismatched = 0;
  let updated = 0;

  for (const row of ledgerRows) {
    checked += 1;
    const correct = businessDateFrom(row.created_at);
    const current = row.business_date != null ? String(row.business_date).slice(0, 10) : '';
    if (!correct || current === correct) continue;

    mismatched += 1;
    if (DRY_RUN) continue;

    await db.query(
      `UPDATE $id SET business_date = $business_date`,
      { id: row.id, business_date: correct }
    );
    updated += 1;
  }

  console.log(
    `Done. checked=${checked} mismatched=${mismatched} updated=${updated}${DRY_RUN ? ' (dry-run, no writes)' : ''}`
  );

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
