'use strict';

/**
 * Regression tests for the row-level (branch_id) RBAC migration.
 *
 * Pins the ROW_LEVEL_TABLES configuration: which tables get branch filtering,
 * the branch_id filter logic, and DDL generation.
 *
 * Run from the repo root:
 *   node --test migrations/scripts/apply-row-level-permissions.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'apply-row-level-permissions.cjs');
delete require.cache[scriptPath];
const mod = require(scriptPath);

const { ROW_LEVEL_TABLES, buildPermissionsClause, branchFilter } = mod;

test('module exports the expected public API', () => {
  assert.equal(typeof ROW_LEVEL_TABLES, 'object');
  assert.equal(typeof buildPermissionsClause, 'function');
  assert.equal(typeof branchFilter, 'function');
});

test('ROW_LEVEL_TABLES covers order, order_item_kitchen, day_closing', () => {
  const tables = Object.keys(ROW_LEVEL_TABLES);
  assert.ok(tables.includes('order'), 'order must have row-level filtering');
  assert.ok(tables.includes('order_item_kitchen'), 'order_item_kitchen must have row-level filtering');
  assert.ok(tables.includes('day_closing'), 'day_closing must have row-level filtering');
  assert.equal(tables.length, 3, 'exactly 3 tables get branch_id filtering');
});

test('order SELECT filters by branch_id', () => {
  const order = ROW_LEVEL_TABLES.order;
  assert.ok(order.select.includes('branch_id = $auth.branch_id'), 'must filter by branch_id');
  assert.ok(order.select.includes("super_admin"), 'super_admin bypasses branch filter');
  assert.ok(order.select.includes("admin"), 'admin bypasses branch filter');
  assert.ok(order.select.includes("$auth.branch_id = NONE"), 'users without branch see all');
});

test('order_item_kitchen SELECT filters by branch_id', () => {
  const kitchen = ROW_LEVEL_TABLES.order_item_kitchen;
  assert.ok(kitchen.select.includes('branch_id = $auth.branch_id'));
  assert.ok(kitchen.select.includes("super_admin"));
});

test('day_closing SELECT filters by branch_id', () => {
  const closing = ROW_LEVEL_TABLES.day_closing;
  assert.ok(closing.select.includes('branch_id = $auth.branch_id'));
  assert.ok(closing.select.includes("super_admin"));
  assert.ok(closing.select.includes("manager"), 'manager can see day_closing');
});

test('every table has all 4 operations defined', () => {
  for (const [name, def] of Object.entries(ROW_LEVEL_TABLES)) {
    assert.ok(def.select !== undefined, `${name} must define select`);
    assert.ok(def.create !== undefined, `${name} must define create`);
    assert.ok(def.update !== undefined, `${name} must define update`);
    assert.ok(def.delete !== undefined, `${name} must define delete`);
  }
});

test('branchFilter helper generates the expected WHERE clause', () => {
  const filter = branchFilter(['waiter', 'cashier']);
  assert.ok(filter.includes('branch_id = $auth.branch_id'));
  assert.ok(filter.includes("super_admin"));
  assert.ok(filter.includes("$auth.branch_id = NONE"));
});

test('buildPermissionsClause generates correct DDL for branch filter', () => {
  const def = ROW_LEVEL_TABLES.order;
  const result = buildPermissionsClause(def);
  assert.ok(result.startsWith('PERMISSIONS'));
  assert.ok(result.includes('FOR select WHERE'));
  assert.ok(result.includes('branch_id = $auth.branch_id'));
  assert.ok(result.includes('FOR create WHERE'));
  assert.ok(result.includes('FOR delete WHERE'));
});

test('the full DDL for order is syntactically valid', () => {
  const order = ROW_LEVEL_TABLES.order;
  const ddl = `DEFINE TABLE order TYPE NORMAL SCHEMAFULL ${buildPermissionsClause(order)};`;
  assert.ok(ddl.startsWith('DEFINE TABLE order TYPE NORMAL SCHEMAFULL PERMISSIONS'));
  assert.ok(ddl.includes('FOR select WHERE'));
  assert.ok(ddl.endsWith(';'));
});

test('non-branch tables are not in ROW_LEVEL_TABLES', () => {
  // These tables don't have branch_id fields and should NOT be here.
  assert.ok(!ROW_LEVEL_TABLES.user, 'user is not row-level filtered (it has branch_id but is the actor)');
  assert.ok(!ROW_LEVEL_TABLES.menu, 'menu is global, not branch-scoped');
  assert.ok(!ROW_LEVEL_TABLES.inventory_item, 'inventory_item uses location, not branch_id');
});

test('CREATE permissions preserve role-based access (not just branch)', () => {
  const order = ROW_LEVEL_TABLES.order;
  // CREATE should allow waiter/cashier (same as granular), regardless of branch.
  // The branch_id is set by the SPA when creating the order, not filtered.
  assert.ok(order.create.includes("waiter"), 'waiter can create orders');
  assert.ok(order.create.includes("cashier"), 'cashier can create orders');
  // CREATE does NOT filter by branch — a waiter creates orders for their branch.
  assert.ok(!order.create.includes('branch_id'), 'CREATE does not filter by branch_id');
});
