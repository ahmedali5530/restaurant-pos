'use strict';

/**
 * Grant admin.security_alerts to roles that already have Admin access.
 *
 * Usage:
 *   SURREAL_USER=... SURREAL_PASS=... node migrations/scripts/backfill-security-alerts-access.cjs
 *
 * Env:
 *   DRY_RUN=1 — count only, do not write
 */

const WS = require('ws');
const { Surreal, StringRecordId } = require('surrealdb');
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;
if (!DB_USER || !DB_PASS) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS env vars are required.');
  process.exit(1);
}
const DRY_RUN = process.env.DRY_RUN === '1';

const MODULE = 'admin.security_alerts';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

const toId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const asString = value.toString();
    if (asString && asString !== '[object Object]' && asString.includes(':')) {
      return asString;
    }
  }
  if (typeof value === 'object' && value.tb != null && value.id != null) {
    return `${value.tb}:${value.id}`;
  }
  return String(value);
};

function hasAdminAccess(roles) {
  if (!Array.isArray(roles)) return false;
  return roles.some((r) => {
    const s = String(r);
    return (
      s === 'admin' ||
      s === 'admin.*' ||
      s === 'super_admin' ||
      s.startsWith('admin.')
    );
  });
}

async function backfillTable(db, table, stats) {
  const records = rows(await db.query(`SELECT id, roles FROM ${table}`));
  for (const row of records) {
    const roles = Array.isArray(row.roles) ? row.roles.map(String) : [];
    if (!roles.length) {
      stats.skipped += 1;
      continue;
    }
    if (roles.includes(MODULE)) {
      stats.unchanged += 1;
      continue;
    }
    if (!hasAdminAccess(roles)) {
      stats.skipped += 1;
      continue;
    }
    stats.updated += 1;
    const next = [...roles, MODULE];
    if (!DRY_RUN) {
      await db.query('UPDATE $id SET roles = $roles', {
        id: new StringRecordId(toId(row.id)),
        roles: next,
      });
    }
  }
}

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL);
  await db.signin({ username: DB_USER, password: DB_PASS });
  await db.use({ namespace: DB_NS, database: DB_NAME });

  console.log(`Connected ${DB_URL} ${DB_NS}/${DB_NAME} DRY_RUN=${DRY_RUN}`);

  const stats = { updated: 0, unchanged: 0, skipped: 0 };
  await backfillTable(db, 'user_role', stats);
  await backfillTable(db, 'user', stats);

  console.log(JSON.stringify(stats, null, 2));
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
