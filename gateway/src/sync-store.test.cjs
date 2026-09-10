'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RecordId, StringRecordId } = require('surrealdb');
const { applyOperation, normalizeSurrealContent, withoutRecordId } = require('./sync-store');

function isRecordId(value) {
  return value instanceof RecordId || value instanceof StringRecordId;
}

/**
 * Records every query. `responder(query, bindings)` may return a value for
 * SELECTs (e.g. an existing order) so ownership / version checks can be tested.
 */
function recordingDb(responder) {
  const calls = [];
  return {
    calls,
    async query(query, bindings = {}) {
      calls.push({ query, bindings });
      const answer = responder ? responder(query, bindings) : undefined;
      return answer === undefined ? [[]] : [[answer]];
    },
  };
}

function orderResponder(order) {
  return (query) => (query.startsWith('SELECT * FROM $id') ? order : undefined);
}

function operation(operationType) {
  return {
    operationId: `terminal:test:${operationType}`,
    terminalId: 'terminal:test',
    sequence: 1,
    aggregateType: 'order',
    aggregateId: 'order:rorder',
    operationType,
    expectedVersion: operationType === 'CREATE_RECORD' ? 0 : 1,
    payload: {
      table: 'order',
      recordId: 'order:rorder',
      data: {
        id: 'order:rorder',
        status: 'In Progress',
        created_at: '2026-09-06T14:56:33.847Z',
        updated_at: '2026-09-06T14:56:33.847Z',
        deleted_at: null,
        owner_heartbeat_at: '2026-09-06T14:56:33.847Z',
        items: ['order_item:ritem'],
      },
      items: [
        {
          id: 'order_item:ritem',
          order: 'order:rorder',
          created_at: '2026-09-06T14:56:33.847Z',
          modifiers: [
            {
              id: 'modifier:cheese',
              quantity: 1,
              selected_at: '2026-09-06T14:56:33.847Z',
            },
          ],
        },
      ],
      kitchens: [
        {
          id: 'order_item_kitchen:rkitchen',
          order_item: 'order_item:ritem',
          status: 'pending',
          created_at: '2026-09-06T14:56:33.847Z',
          activated_at: '2026-09-06T14:56:33.847Z',
          completed_at: null,
        },
      ],
    },
  };
}

function contentBindings(db) {
  return db.calls
    .filter(({ query }) => query.includes('CONTENT') || query.includes('MERGE'))
    .map(({ bindings }) => bindings.data || bindings.item || bindings.kitchen || bindings.patch);
}

test('normalizes datetime fields recursively without mutating source content', () => {
  const source = {
    id: 'order:rorder',
    created_at: '2026-09-06T14:56:33.847Z',
    deleted_at: null,
    nested: { selected_at: '2026-09-06T14:56:33.847Z' },
  };
  const normalized = withoutRecordId(source);

  assert.equal(Object.hasOwn(normalized, 'id'), false);
  assert.ok(normalized.created_at instanceof Date);
  assert.equal(normalized.deleted_at, null);
  assert.ok(normalized.nested.selected_at instanceof Date);
  assert.equal(source.created_at, '2026-09-06T14:56:33.847Z');
  assert.equal(normalizeSurrealContent('unchanged'), 'unchanged');
});

test('toSurrealContent coerces declared order aggregate links and preserves modifiers', () => {
  const { toSurrealContent } = require('./sync-store');
  const content = toSurrealContent('order', {
    id: 'order:rorder',
    floor: 'floor:f1',
    table: 'floor_table:t1',
    order_type: 'order_type:dine',
    customer: null,
    user: 'user:u1',
    cashier: { id: 'user:u2' },
    tax: 'tax:vat',
    discount: undefined,
    items: ['order_item:i1'],
    payments: ['order_payment:p1'],
    order_taxes: [],
    created_at: '2026-09-06T14:56:33.847Z',
    owner_terminal_id: 'terminal:abc',
  });

  assert.equal(Object.hasOwn(content, 'id'), false);
  assert.ok(isRecordId(content.floor));
  assert.ok(isRecordId(content.table));
  assert.ok(isRecordId(content.order_type));
  assert.equal(content.customer, null);
  assert.ok(isRecordId(content.user));
  assert.ok(isRecordId(content.cashier));
  assert.ok(isRecordId(content.tax));
  assert.equal(Object.hasOwn(content, 'discount'), false);
  assert.ok(content.items.every(isRecordId));
  assert.ok(content.payments.every(isRecordId));
  assert.deepEqual(content.order_taxes, []);
  assert.ok(content.created_at instanceof Date);
  assert.equal(content.owner_terminal_id, 'terminal:abc');

  const item = toSurrealContent('order_item', {
    id: 'order_item:i1',
    order: 'order:rorder',
    item: 'menu_item:d1',
    category_id: 'legacy-freeform',
    taxes: ['tax:vat'],
    tax: 1.25,
    modifiers: [{ id: 'modifier:cheese', selected_at: '2026-09-06T14:56:33.847Z' }],
    created_at: '2026-09-06T14:56:33.847Z',
  });
  assert.ok(isRecordId(item.order));
  assert.ok(isRecordId(item.item));
  assert.equal(item.category_id, 'legacy-freeform');
  // order_item.tax is a float amount, not a record<link>.
  assert.equal(item.tax, 1.25);
  assert.ok(item.taxes.every(isRecordId));
  assert.equal(item.modifiers[0].id, 'modifier:cheese');
  assert.ok(item.modifiers[0].selected_at instanceof Date);

  const qualified = toSurrealContent('order_item', {
    category_id: 'category:sides',
  });
  assert.ok(isRecordId(qualified.category_id));
});

test('CREATE_RECORD writes children before order and links only written items', async () => {
  const db = recordingDb();
  await applyOperation(db, operation('CREATE_RECORD'), 'terminal:test', 'default');

  const childBeforeOrder = db.calls.findIndex(({ query, bindings }) =>
    query.includes('CONTENT') && bindings.item);
  const orderIdx = db.calls.findIndex(({ query, bindings }) =>
    query.includes('CONTENT') && bindings.data && Array.isArray(bindings.data.items));
  assert.ok(childBeforeOrder >= 0);
  assert.ok(orderIdx > childBeforeOrder);

  const contents = contentBindings(db);
  const item = contents.find((value) => String(value?.order) === 'order:rorder');
  const kitchen = contents.find((value) => String(value?.order_item) === 'order_item:ritem');
  const order = contents.find((value) => Array.isArray(value?.items));
  assert.ok(item && kitchen && order);
  assert.ok(order.items.every(isRecordId));
  assert.equal(item.position, 0);
  assert.equal(item.modifiers[0].id, 'modifier:cheese');
});

test('MERGE_RECORD upserts children then appends links — never MERGE-replaces items', async () => {
  const db = recordingDb();
  const op = operation('MERGE_RECORD');
  // Poisonous full array (includes an orphan the client still thinks exists).
  op.payload.data.items = ['order_item:orphan', 'order_item:ritem'];
  await applyOperation(db, op, 'terminal:test', 'default');

  const mergePatches = db.calls
    .filter(({ query }) => query.includes('MERGE'))
    .map(({ bindings }) => bindings.patch);
  assert.ok(mergePatches.every((patch) => patch && !('items' in patch)));

  const append = db.calls.find(({ query }) => query.includes('array::union'));
  assert.ok(append);
  assert.equal(append.bindings.itemIds.length, 1);
  assert.ok(isRecordId(append.bindings.itemIds[0]));
  assert.equal(String(append.bindings.itemIds[0]), 'order_item:ritem');

  const contents = contentBindings(db);
  const item = contents.find((value) => String(value?.order) === 'order:rorder');
  assert.ok(item);
  assert.ok(isRecordId(item.order));
});

test('MERGE_RECORD coerces order_type record links', async () => {
  const db = recordingDb();
  await applyOperation(
    db,
    {
      operationId: 'terminal:test:merge-type',
      terminalId: 'terminal:test',
      sequence: 1,
      aggregateType: 'order',
      aggregateId: 'order:rorder',
      operationType: 'MERGE_RECORD',
      expectedVersion: 1,
      payload: {
        table: 'order',
        recordId: 'order:rorder',
        data: {
          order_type: 'order_type:dinein',
          updated_at: '2026-09-07T12:00:00.000Z',
        },
      },
    },
    'terminal:test',
    'default',
  );

  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.ok(merge);
  assert.ok(isRecordId(merge.bindings.patch.order_type));
  assert.equal(String(merge.bindings.patch.order_type), 'order_type:dinein');
  assert.ok(merge.bindings.patch.updated_at instanceof Date);
});


test('CREATE_PAYMENT upserts the payment then unions it into order.payments', async () => {
  const db = recordingDb(orderResponder({ id: 'order:rorder', owner_terminal_id: 'terminal:test', server_version: 3 }));
  const result = await applyOperation(
    db,
    {
      operationId: 'terminal:test:pay',
      sequence: 1,
      aggregateType: 'order',
      aggregateId: 'order:rorder',
      operationType: 'CREATE_PAYMENT',
      expectedVersion: 3,
      payload: {
        table: 'order_payment',
        recordId: 'order_payment:rpay',
        orderId: 'order:rorder',
        data: {
          id: 'order_payment:rpay',
          order: 'order:rorder',
          amount: 10,
          payable: 10,
          payment_type: 'payment_type:cash',
          created_at: '2026-09-07T12:00:00.000Z',
        },
      },
    },
    'terminal:test',
    'default',
  );
  assert.equal(result.status, 'accepted');
  const upsert = db.calls.find(({ query }) => query.includes('CONTENT'));
  assert.ok(isRecordId(upsert.bindings.data.payment_type));
  assert.equal('order' in upsert.bindings.data, false, 'local-only order field stripped');
  assert.equal('created_at' in upsert.bindings.data, false, 'created_at not on SCHEMAFULL order_payment');
  assert.equal('id' in upsert.bindings.data, false, 'id not part of CONTENT payload');
  const union = db.calls.find(({ query }) => query.includes('payments = array::union'));
  assert.ok(union);
  assert.equal(String(union.bindings.payment), 'order_payment:rpay');
  const versionBump = db.calls.find(
    ({ query }) => query.includes('server_version') && query.includes('UPDATE $id SET'),
  );
  assert.ok(versionBump, 'CREATE_PAYMENT bumps order.server_version');
  assert.equal(versionBump.bindings.version, 4);
});

test('REPLACE_ORDER_RELATION upserts rows, deletes stale ones and sets the link array', async () => {
  const db = recordingDb((query) => {
    if (query.startsWith('SELECT * FROM $id')) return { id: 'order:rorder', owner_terminal_id: 'terminal:test', server_version: 2 };
    if (query.startsWith('SELECT VALUE order_taxes')) return ['order_tax:old', 'order_tax:keep'];
    return undefined;
  });
  const result = await applyOperation(
    db,
    {
      operationId: 'terminal:test:taxes',
      sequence: 1,
      aggregateType: 'order',
      aggregateId: 'order:rorder',
      operationType: 'REPLACE_ORDER_RELATION',
      expectedVersion: 2,
      payload: {
        table: 'order_tax',
        relation: 'order_taxes',
        orderId: 'order:rorder',
        recordId: 'order:rorder',
        rows: [{ id: 'order_tax:keep', order: 'order:rorder', tax: 'tax:vat', amount: 1.5 }],
        data: { tax_amount: 1.5 },
      },
    },
    'terminal:test',
    'default',
  );
  assert.equal(result.status, 'accepted');
  const del = db.calls.find(({ query }) => query.startsWith('DELETE $stale'));
  assert.ok(del);
  assert.deepEqual(del.bindings.stale, ['order_tax:old']);
  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.equal(merge.bindings.patch.tax_amount, 1.5);
  assert.equal(merge.bindings.patch.server_version, 3);
  assert.equal(merge.bindings.patch.order_taxes.length, 1);
  assert.ok(isRecordId(merge.bindings.patch.order_taxes[0]));
});

test('REPLACE_ORDER_RELATION rejects unknown relations', async () => {
  const db = recordingDb(orderResponder({ id: 'order:rorder', owner_terminal_id: 'terminal:test' }));
  const result = await applyOperation(
    db,
    {
      operationId: 'terminal:test:bad', sequence: 1, aggregateType: 'order', aggregateId: 'order:rorder',
      operationType: 'REPLACE_ORDER_RELATION', expectedVersion: 1,
      payload: { table: 'order_tax', relation: 'items; DELETE order', orderId: 'order:rorder', rows: [] },
    },
    'terminal:test',
    'default',
  );
  assert.equal(result.status, 'conflict');
  assert.equal(result.code, 'APPLY_ERROR');
});

test('MERGE_RECORD on order fast-forwards when the owner client is behind', async () => {
  const db = recordingDb(orderResponder({ id: 'order:rorder', owner_terminal_id: 'terminal:test', server_version: 5 }));
  const op = operation('MERGE_RECORD');
  op.expectedVersion = 3;
  const result = await applyOperation(db, op, 'terminal:test', 'default');
  assert.equal(result.status, 'accepted');
  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.equal(merge.bindings.patch.server_version, 6);
});

test('MERGE_RECORD on order transfers ownership to the pushing terminal', async () => {
  const db = recordingDb(orderResponder({ id: 'order:rorder', owner_terminal_id: 'terminal:other', server_version: 3 }));
  const op = operation('MERGE_RECORD');
  op.expectedVersion = 3;
  op.payload.data = { notes: 'from other terminal' };
  const result = await applyOperation(db, op, 'terminal:test', 'default');
  assert.equal(result.status, 'accepted');
  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.equal(merge.bindings.patch.owner_terminal_id, 'terminal:test');
  assert.equal(merge.bindings.patch.notes, 'from other terminal');
});

test('MERGE_RECORD on order bumps server_version when versions agree', async () => {
  const db = recordingDb(orderResponder({ id: 'order:rorder', owner_terminal_id: 'terminal:test', server_version: 1 }));
  const op = operation('MERGE_RECORD');
  op.payload.data = { notes: 'hi' };
  const result = await applyOperation(db, op, 'terminal:test', 'default');
  assert.equal(result.status, 'accepted');
  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.equal(merge.bindings.patch.server_version, 2);
});

test('MERGE_RECORD on floor_table only writes lock fields with coerced ids', async () => {
  const db = recordingDb();
  const result = await applyOperation(
    db,
    {
      operationId: 'terminal:test:lock', sequence: 1, aggregateType: 'floor_table', aggregateId: 'floor_table:t1',
      operationType: 'MERGE_RECORD', expectedVersion: 0,
      payload: {
        table: 'floor_table', recordId: 'floor_table:t1',
        data: { is_locked: true, locked_by: 'user:u1', locked_at: '2026-09-07T12:00:00.000Z', name: 'HACK', x: 1 },
      },
    },
    'terminal:test',
    'default',
  );
  assert.equal(result.status, 'accepted');
  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.deepEqual(Object.keys(merge.bindings.patch).sort(), ['is_locked', 'locked_at', 'locked_by']);
  assert.ok(merge.bindings.patch.locked_at instanceof Date);
});

test('MERGE_RECORD on order_item is allowed and coerces links; financial rows stay immutable', async () => {
  const db = recordingDb();
  const ok = await applyOperation(
    db,
    {
      operationId: 'terminal:test:item', sequence: 1, aggregateType: 'order_item', aggregateId: 'order_item:ritem',
      operationType: 'MERGE_RECORD', expectedVersion: 0,
      payload: { table: 'order_item', recordId: 'order_item:ritem', data: { order: 'order:child', seat: 2, deleted_at: '2026-09-07T12:00:00.000Z' } },
    },
    'terminal:test',
    'default',
  );
  assert.equal(ok.status, 'accepted');
  const merge = db.calls.find(({ query }) => query.includes('MERGE'));
  assert.ok(isRecordId(merge.bindings.patch.order));
  assert.equal(merge.bindings.patch.seat, '2');

  const bad = await applyOperation(
    recordingDb(),
    {
      operationId: 'terminal:test:void-merge', sequence: 2, aggregateType: 'order_void', aggregateId: 'order_void:v',
      operationType: 'MERGE_RECORD', expectedVersion: 0,
      payload: { table: 'order_void', recordId: 'order_void:v', data: { reason: 'x' } },
    },
    'terminal:test',
    'default',
  );
  assert.equal(bad.code, 'FINANCIAL_OPERATION_IMMUTABLE');
});

test('CREATE_RECORD child rows coerce links and can link into the parent order', async () => {
  const db = recordingDb();
  const result = await applyOperation(
    db,
    {
      operationId: 'terminal:test:void', sequence: 1, aggregateType: 'order', aggregateId: 'order:rorder',
      operationType: 'CREATE_RECORD', expectedVersion: 0,
      payload: {
        table: 'order_void', recordId: 'order_void:rv', orderId: 'order:rorder',
        data: { id: 'order_void:rv', order: 'order:rorder', items: ['order_item:ritem'], deleted_by: 'user:u1', quantity: 1, reason: 'Spill', created_at: '2026-09-07T12:00:00.000Z' },
      },
    },
    'terminal:test',
    'default',
  );
  assert.equal(result.status, 'accepted');
  const upsert = db.calls.find(({ query }) => query.includes('CONTENT'));
  assert.ok(isRecordId(upsert.bindings.data.order));
  assert.ok(isRecordId(upsert.bindings.data.deleted_by));
  assert.ok(upsert.bindings.data.items.every(isRecordId));

  const coupon = recordingDb();
  await applyOperation(
    coupon,
    {
      operationId: 'terminal:test:coupon', sequence: 1, aggregateType: 'order', aggregateId: 'order:rorder',
      operationType: 'CREATE_RECORD', expectedVersion: 0,
      payload: {
        table: 'order_coupon', recordId: 'order_coupon:rc', orderId: 'order:rorder', linkField: 'coupon',
        data: { id: 'order_coupon:rc', order: 'order:rorder', coupon: 'coupon:c1', discount: 2 },
      },
    },
    'terminal:test',
    'default',
  );
  const link = coupon.calls.find(({ query }) => query.includes('SET coupon = $child'));
  assert.ok(link);
  assert.equal(String(link.bindings.child), 'order_coupon:rc');
});

test('STEAL_ORDER is refused while the owner heartbeat is fresh', async () => {
  const fresh = recordingDb(orderResponder({
    id: 'order:rorder', owner_terminal_id: 'terminal:other', owner_heartbeat_at: new Date().toISOString(), server_version: 1,
  }));
  const refused = await applyOperation(
    fresh,
    { operationId: 'terminal:test:steal', sequence: 1, aggregateType: 'order', aggregateId: 'order:rorder', operationType: 'STEAL_ORDER', expectedVersion: 1, payload: {} },
    'terminal:test',
    'default',
  );
  assert.equal(refused.code, 'OWNER_FRESH');

  const stale = recordingDb(orderResponder({
    id: 'order:rorder', owner_terminal_id: 'terminal:other', owner_heartbeat_at: new Date(Date.now() - 120_000).toISOString(), server_version: 1,
  }));
  const ok = await applyOperation(
    stale,
    { operationId: 'terminal:test:steal2', sequence: 1, aggregateType: 'order', aggregateId: 'order:rorder', operationType: 'STEAL_ORDER', expectedVersion: 1, payload: {} },
    'terminal:test',
    'default',
  );
  assert.equal(ok.status, 'accepted');
  const merge = stale.calls.find(({ query }) => query.includes('MERGE'));
  assert.equal(merge.bindings.patch.owner_terminal_id, 'terminal:test');
  assert.equal(merge.bindings.patch.server_version, 2);
});
