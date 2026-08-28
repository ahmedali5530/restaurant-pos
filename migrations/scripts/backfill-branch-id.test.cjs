'use strict';

/**
 * Regression tests for the branch_id backfill script.
 *
 * Pins the three backfill functions (orders, kitchen items, day closings)
 * by mocking the db client and verifying the correct queries are issued.
 *
 * Run from the repo root:
 *   node --test migrations/scripts/backfill-branch-id.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'backfill-branch-id.cjs');
delete require.cache[scriptPath];
const mod = require(scriptPath);

const { backfillOrders, backfillKitchenItems, backfillDayClosings } = mod;

// Mock db — returns canned rows and records all queries.
function mockDb(cannedRows) {
  const queries = [];
  return {
    queries,
    query: async (q, params) => {
      queries.push({ q, params });
      return cannedRows;
    },
    close: async () => {},
  };
}

test('module exports the three backfill functions', () => {
  assert.equal(typeof backfillOrders, 'function');
  assert.equal(typeof backfillKitchenItems, 'function');
  assert.equal(typeof backfillDayClosings, 'function');
});

test('backfillOrders updates orders that have a user with branch_id', async () => {
  const db = mockDb([[
    { id: 'order:1', user_branch_id: 'inventory_store:branch_a' },
    { id: 'order:2', user_branch_id: 'inventory_store:branch_b' },
  ]]);
  const result = await backfillOrders(db);
  assert.equal(result.scanned, 2);
  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 0);
  // Two UPDATE queries issued
  assert.equal(db.queries.filter((q) => q.q.includes('UPDATE')).length, 2);
});

test('backfillOrders skips orders where user has no branch_id', async () => {
  const db = mockDb([[
    { id: 'order:1', user_branch_id: null },
  ]]);
  const result = await backfillOrders(db);
  assert.equal(result.scanned, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
});

test('backfillOrders returns 0 when no orders need backfill', async () => {
  const db = mockDb([[]]); // empty result
  const result = await backfillOrders(db);
  assert.equal(result.scanned, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 0);
});

test('backfillOrders handles record object form of branch_id', async () => {
  const db = mockDb([[
    { id: 'order:1', user_branch_id: { id: 'inventory_store:branch_a' } },
  ]]);
  const result = await backfillOrders(db);
  assert.equal(result.updated, 1);
  // Verify the UPDATE query used the string form
  const updateQuery = db.queries.find((q) => q.q.includes('UPDATE'));
  assert.ok(updateQuery);
  assert.equal(updateQuery.params.branch, 'inventory_store:branch_a');
});

test('backfillKitchenItems derives branch_id from parent order', async () => {
  const db = mockDb([[
    { id: 'order_item_kitchen:1', order_branch_id: 'inventory_store:branch_a' },
  ]]);
  const result = await backfillKitchenItems(db);
  assert.equal(result.scanned, 1);
  assert.equal(result.updated, 1);
});

test('backfillKitchenItems skips when parent order has no branch_id', async () => {
  const db = mockDb([[
    { id: 'order_item_kitchen:1', order_branch_id: null },
  ]]);
  const result = await backfillKitchenItems(db);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
});

test('backfillDayClosings derives branch_id from closing user', async () => {
  const db = mockDb([[
    { id: 'day_closing:1', user_branch_id: 'inventory_store:branch_b' },
  ]]);
  const result = await backfillDayClosings(db);
  assert.equal(result.scanned, 1);
  assert.equal(result.updated, 1);
});

test('backfillDayClosings skips when user has no branch_id', async () => {
  const db = mockDb([[
    { id: 'day_closing:1', user_branch_id: null },
  ]]);
  const result = await backfillDayClosings(db);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
});

test('all backfill functions handle empty results gracefully', async () => {
  const db = mockDb([[]]);
  const orderResult = await backfillOrders(db);
  const kitchenResult = await backfillKitchenItems(db);
  const closingResult = await backfillDayClosings(db);
  assert.equal(orderResult.scanned + kitchenResult.scanned + closingResult.scanned, 0);
});
