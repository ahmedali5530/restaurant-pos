'use strict';

/**
 * Regression tests for the granular per-role RBAC migration script.
 *
 * Pins the GRANULAR_TABLES configuration: which tables get granular permissions,
 * which roles can perform which operations, and that the DDL generation is correct.
 *
 * Run from the repo root:
 *   node --test migrations/scripts/apply-granular-rbac-permissions.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'apply-granular-rbac-permissions.cjs');

// The script guards its env-var check with `require.main === module`, so
// requiring it (without running it as the main module) does NOT call
// process.exit. The Surreal import at the top is lazy (only used in main()).
delete require.cache[scriptPath];
const mod = require(scriptPath);

const TABLES = mod.GRANULAR_TABLES;
const buildPermissionsClause = mod.buildPermissionsClause;
const tableNames = Object.keys(TABLES);

test('GRANULAR_TABLES covers a meaningful subset of tables', () => {
  assert.ok(tableNames.length >= 50, `expected ≥50 granular tables, got ${tableNames.length}`);
  assert.ok(tableNames.length <= 130, `expected ≤130 granular tables (non-critical), got ${tableNames.length}`);
});

test('order table is restricted to waiter/cashier/kitchen/admin', () => {
  const order = TABLES.order;
  assert.ok(order, 'order table must be in GRANULAR_TABLES');
  // CREATE — waiter + cashier + admin
  assert.ok(order.create.includes("waiter"), 'waiter can create orders');
  assert.ok(order.create.includes("cashier"), 'cashier can create orders');
  assert.ok(!order.create.includes("kitchen"), 'kitchen CANNOT create orders');
  // UPDATE — kitchen can update status
  assert.ok(order.update.includes("kitchen"), 'kitchen can update orders');
  // SELECT — all operational roles
  assert.ok(order.select.includes("delivery"), 'delivery can read orders');
});

test('inventory tables are restricted to inventory role', () => {
  for (const t of ['inventory_item', 'inventory_purchase', 'inventory_ledger']) {
    const def = TABLES[t];
    assert.ok(def, `${t} must be in GRANULAR_TABLES`);
    assert.ok(def.create.includes("inventory"), `${t}.create must allow inventory role`);
    assert.ok(!def.create.includes("waiter"), `${t}.create must NOT allow waiter`);
  }
});

test('inventory_ledger is append-only (update/delete = NONE)', () => {
  const ledger = TABLES.inventory_ledger;
  assert.equal(ledger.update, 'NONE', 'ledger must be append-only');
  assert.equal(ledger.delete, 'NONE', 'ledger cannot be deleted');
});

test('menu/catalog tables allow all authenticated users to read, only admin to write', () => {
  for (const t of ['menu', 'menu_item', 'category', 'tax', 'modifier', 'modifier_group']) {
    const def = TABLES[t];
    assert.ok(def, `${t} must be in GRANULAR_TABLES`);
    assert.equal(def.select, 'FULL', `${t}.select must be FULL (all read)`);
    assert.ok(def.create.includes("admin"), `${t}.create must allow admin`);
    assert.ok(!def.create.includes("waiter"), `${t}.create must NOT allow waiter`);
  }
});

test('account tables are restricted to accountant role', () => {
  const account = TABLES.account;
  assert.ok(account, 'account table must be in GRANULAR_TABLES');
  assert.ok(account.create.includes("accountant"), 'accountant can create accounts');
  assert.ok(!account.create.includes("waiter"), 'waiter CANNOT create accounts');
});

test('audit_log is append-only (update = NONE), admin can purge', () => {
  const audit = TABLES.audit_log;
  assert.ok(audit, 'audit_log must be in GRANULAR_TABLES');
  assert.equal(audit.update, 'NONE', 'audit_log must be append-only');
  assert.equal(audit.select.includes("admin"), true, 'admin can read audit_log');
  assert.ok(audit.delete.includes("admin"), 'admin can purge old audit entries');
});

test('revoked_session is append-only (update = NONE)', () => {
  const revoked = TABLES.revoked_session;
  assert.ok(revoked, 'revoked_session must be in GRANULAR_TABLES');
  assert.equal(revoked.update, 'NONE', 'revoked_session must be append-only');
  assert.ok(revoked.select.includes("admin"), 'admin can read revoked_session');
});

test('every granular table has all 4 operations defined', () => {
  for (const [name, def] of Object.entries(TABLES)) {
    assert.ok(def.select !== undefined, `${name} must define select`);
    assert.ok(def.create !== undefined, `${name} must define create`);
    assert.ok(def.update !== undefined, `${name} must define update`);
    assert.ok(def.delete !== undefined, `${name} must define delete`);
  }
});

test('super_admin is included in every WHERE clause (or FULL)', () => {
  for (const [name, def] of Object.entries(TABLES)) {
    for (const op of ['select', 'create', 'update', 'delete']) {
      const rule = def[op];
      if (rule === 'FULL' || rule === 'NONE') continue;
      assert.ok(
        rule.includes("super_admin"),
        `${name}.${op} must include super_admin in WHERE clause (got: ${rule})`
      );
    }
  }
});

test('buildPermissionsClause generates correct DDL for FULL', () => {
  const result = buildPermissionsClause({ select: 'FULL', create: 'FULL', update: 'FULL', delete: 'FULL' });
  assert.equal(result, 'PERMISSIONS FOR select FULL, FOR create FULL, FOR update FULL, FOR delete FULL');
});

test('buildPermissionsClause generates correct DDL for NONE', () => {
  const result = buildPermissionsClause({ select: 'FULL', create: 'NONE', update: 'NONE', delete: 'NONE' });
  assert.ok(result.includes('FOR create NONE'));
  assert.ok(result.includes('FOR update NONE'));
  assert.ok(result.includes('FOR delete NONE'));
});

test('buildPermissionsClause generates WHERE clause for role rules', () => {
  const result = buildPermissionsClause({
    select: "$auth.roles CONTAINS 'admin'",
    create: "$auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'waiter'",
    update: 'FULL',
    delete: 'NONE',
  });
  assert.ok(result.includes("FOR select WHERE $auth.roles CONTAINS 'admin'"));
  assert.ok(result.includes("FOR create WHERE $auth.roles CONTAINS 'admin' OR $auth.roles CONTAINS 'waiter'"));
  assert.ok(result.includes('FOR update FULL'));
  assert.ok(result.includes('FOR delete NONE'));
});

test('the full DDL for order is syntactically valid', () => {
  const order = TABLES.order;
  const ddl = `DEFINE TABLE order TYPE NORMAL SCHEMAFULL ${buildPermissionsClause(order)};`;
  assert.ok(ddl.startsWith('DEFINE TABLE order TYPE NORMAL SCHEMAFULL PERMISSIONS'));
  assert.ok(ddl.includes('FOR select WHERE'));
  assert.ok(ddl.includes('FOR create WHERE'));
  assert.ok(ddl.endsWith(';'));
});

test('kitchen_reconciliation is restricted to kitchen role', () => {
  const recon = TABLES.kitchen_reconciliation;
  assert.ok(recon, 'kitchen_reconciliation must be in GRANULAR_TABLES');
  assert.ok(recon.create.includes("kitchen"), 'kitchen can create reconciliation');
  assert.ok(!recon.create.includes("waiter"), 'waiter CANNOT create reconciliation');
});

test('customer tables allow waiter/cashier/delivery to create', () => {
  const customer = TABLES.customer;
  assert.ok(customer.create.includes("waiter"), 'waiter can create customers');
  assert.ok(customer.create.includes("cashier"), 'cashier can create customers');
  assert.ok(customer.create.includes("delivery"), 'delivery can create customers');
});

test('order_number_seq is read/create only (no update/delete)', () => {
  const seq = TABLES.order_number_seq;
  assert.equal(seq.update, 'NONE', 'order_number_seq must not be updatable');
  assert.equal(seq.delete, 'NONE', 'order_number_seq must not be deletable');
});
