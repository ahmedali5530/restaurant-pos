'use strict';

/**
 * Emergency unlock + copy HQ user_role rows onto a branch Surreal DB.
 *
 * Use when Sync now pulled users but not roles (or wipe-catalog cleared
 * user_role) and nobody can open Manage / Settings.
 *
 * Modes:
 *   1) Copy roles from cloud master (preferred):
 *        CONFIRM=1 MASTER_URL=ws://... MASTER_NS=... MASTER_DB=... \
 *        SURREAL_URL=ws://... SURREAL_NS=posr SURREAL_DB=posr \
 *        SURREAL_USER=root SURREAL_PASS=root \
 *        node migrations/scripts/restore-user-roles.cjs
 *
 *   2) Unlock one login with full modules even if master is unreachable:
 *        CONFIRM=1 UNLOCK_LOGIN=5555 SURREAL_URL=... SURREAL_USER=... SURREAL_PASS=... \
 *        node migrations/scripts/restore-user-roles.cjs
 *
 * Both modes can be combined. DRY_RUN=1 previews only.
 */

const WS = require('ws');
const { Surreal, RecordId } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER;
const DB_PASS = process.env.SURREAL_PASS;

const MASTER_URL = process.env.MASTER_URL || process.env.SYNC_MASTER_URL || '';
const MASTER_NS = process.env.MASTER_NS || process.env.SYNC_MASTER_NS || '';
const MASTER_DB = process.env.MASTER_DB || process.env.SYNC_MASTER_DB || '';
const MASTER_USER = process.env.MASTER_USER || process.env.SYNC_MASTER_USER || DB_USER;
const MASTER_PASS = process.env.MASTER_PASS || process.env.SYNC_MASTER_PASS || DB_PASS;

const DRY_RUN = process.env.DRY_RUN === '1';
const CONFIRM = process.env.CONFIRM === '1';
const UNLOCK_LOGIN = String(process.env.UNLOCK_LOGIN || '').trim();

/** Minimal full-access set so Manage + Settings open; prefer copying real HQ roles. */
const EMERGENCY_MODULES = [
  'menu', 'orders', 'summary', 'reports', 'admin', 'settings', 'inventory',
  'hr', 'accounts', 'integrations', 'delivery', 'closing', 'kitchen', 'tips',
  'riders', 'order_display',
  'admin.users', 'admin.users.create', 'admin.users.update', 'admin.users.delete',
  'admin.roles', 'admin.roles.create', 'admin.roles.update', 'admin.roles.delete',
  'admin.catalog_publish',
  'settings.access_control', 'settings.branding', 'settings.menus',
];

if (!DB_USER || !DB_PASS) {
  console.error('ERROR: SURREAL_USER and SURREAL_PASS are required (branch DB).');
  process.exit(1);
}

if (!DRY_RUN && !CONFIRM) {
  console.error('Refusing to write without CONFIRM=1. Use DRY_RUN=1 to preview.');
  process.exit(1);
}

if (!MASTER_URL && !UNLOCK_LOGIN) {
  console.error('Set MASTER_URL (copy roles) and/or UNLOCK_LOGIN (emergency grant).');
  process.exit(1);
}

function asRows(result) {
  const first = Array.isArray(result) ? result[0] : result;
  if (Array.isArray(first)) return first;
  return [];
}

async function connect(label, url, ns, db, user, pass) {
  const client = new Surreal();
  await client.connect(url);
  await client.signin({ username: user, password: pass });
  await client.use({ namespace: ns, database: db });
  console.log(`connected ${label}`, { url, ns, db });
  return client;
}

function rolePayload(row) {
  const out = { ...row };
  delete out.id;
  delete out.branch_id;
  delete out.branch_ids;
  if (out.name == null) out.name = 'Role';
  if (!Array.isArray(out.roles)) out.roles = [];
  return out;
}

async function copyRolesFromMaster(branch) {
  if (!MASTER_URL || !MASTER_NS || !MASTER_DB) {
    console.log('Skip master copy (MASTER_URL / MASTER_NS / MASTER_DB not set).');
    return 0;
  }

  const master = await connect(
    'master',
    MASTER_URL,
    MASTER_NS,
    MASTER_DB,
    MASTER_USER,
    MASTER_PASS,
  );

  try {
    const rows = asRows(
      await master.query(
        `SELECT * FROM user_role WHERE deleted_at = NONE OR deleted_at = NULL`,
      ),
    );
    console.log(`master user_role active rows: ${rows.length}`);

    let written = 0;
    for (const row of rows) {
      const id = row?.id;
      if (!id) continue;
      const thing =
        typeof id === 'object' && id.tb && id.id != null
          ? new RecordId(String(id.tb), id.id)
          : id;
      const payload = rolePayload(row);
      console.log(`  ${String(thing)}  name=${payload.name}  modules=${payload.roles.length}`);
      if (DRY_RUN) continue;
      await branch.upsert(thing).merge(payload);
      written += 1;
    }
    return written;
  } finally {
    await master.close();
  }
}

async function unlockLogin(branch) {
  if (!UNLOCK_LOGIN) return;

  const users = asRows(
    await branch.query(
      `SELECT * FROM user WHERE login = $login AND (deleted_at = NONE OR deleted_at = NULL) LIMIT 5`,
      { login: UNLOCK_LOGIN },
    ),
  );
  if (!users.length) {
    console.error(`No active user with login=${UNLOCK_LOGIN}`);
    process.exit(2);
  }

  const user = users[0];
  const roleId = new RecordId('user_role', 'emergency_master');
  console.log(
    `Unlock login=${UNLOCK_LOGIN} user=${String(user.id)} → ${String(roleId)} + direct roles[]`,
  );

  if (DRY_RUN) return;

  await branch.upsert(roleId).merge({
    name: 'Master',
    roles: [...EMERGENCY_MODULES],
    deleted_at: null,
  });

  await branch.query(
    `UPDATE $user SET user_role = $role, roles = $modules`,
    {
      user: user.id,
      role: roleId,
      modules: [...EMERGENCY_MODULES],
    },
  );
  console.log('Unlocked. Log in again (hard-refresh / clear posr-terminal IndexedDB if needed).');
}

async function main() {
  const branch = await connect('branch', DB_URL, DB_NS, DB_NAME, DB_USER, DB_PASS);
  try {
    console.log(
      `${DRY_RUN ? 'DRY RUN' : 'RESTORE'} user roles on ${DB_NS}/${DB_NAME} @ ${DB_URL}`,
    );
    const copied = await copyRolesFromMaster(branch);
    if (!DRY_RUN) console.log(`Copied ${copied} user_role row(s) from master.`);
    await unlockLogin(branch);

    const after = asRows(await branch.query(`SELECT count() FROM user_role GROUP ALL`));
    const count = after[0]?.count ?? after[0]?.['count()'] ?? '?';
    console.log(`Branch user_role count now: ${count}`);
  } finally {
    await branch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
