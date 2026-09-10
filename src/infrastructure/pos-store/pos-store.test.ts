import { beforeEach, describe, expect, it } from 'vitest';
import {
  OWNER_HEARTBEAT_STALE_MS,
  posStore,
  resetPosStoreConnectivityForTests,
  resetPosStoreDatabaseForTests,
} from '@/infrastructure/pos-store/index.ts';
import { recordId } from '@/infrastructure/pos-store/identity.ts';
import { canStealOrder, isOwnerHeartbeatStale } from '@/infrastructure/pos-store/ownership.ts';

describe('SurrealDB record IDs', () => {
  it('generates unquoted-safe record IDs', () => {
    expect(recordId('order')).toMatch(/^order:r[0-9a-f]{32}$/);
    expect(recordId('order_item')).toMatch(/^order_item:r[0-9a-f]{32}$/);
    expect(recordId('order_item_kitchen')).toMatch(/^order_item_kitchen:r[0-9a-f]{32}$/);
  });

  it('preserves explicit record IDs', () => {
    expect(recordId('order', 'existing')).toBe('order:existing');
    expect(recordId('order', 'order:existing')).toBe('order:existing');
  });
});

describe('PosStore create order + ownership', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    resetPosStoreConnectivityForTests(true);
    await posStore.initialize();
  });

  it('creates an order with items and claims ownership in one path', async () => {
    const identity = await posStore.getTerminalIdentity();
    const { order, items } = await posStore.createOrderWithItems({
      invoiceNumber: 42,
      covers: 2,
      tableId: 'floor_table:t1',
      items: [
        {
          dishId: 'menu_item:dish1',
          price: 10,
          quantity: 1,
          kitchenStages: [
            {
              kitchenId: 'kitchen:k1',
              sequence: 0,
              isTerminal: true,
              status: 'pending',
            },
          ],
        },
      ],
    });

    expect(order.owner_terminal_id).toBe(identity.terminalId);
    expect(order.server_version).toBe(1);
    expect(items).toHaveLength(1);
    expect(order.items).toHaveLength(1);

    const pending = await posStore.getPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].operation?.operationType).toBe('CREATE_RECORD');
    expect(pending[0].status).toBe('pending');
  });

  it('rejects merge from a non-owner terminal while offline', async () => {
    resetPosStoreConnectivityForTests(false);
    const { order } = await posStore.createOrderWithItems({
      items: [{ dishId: 'menu_item:d', price: 5, quantity: 1 }],
    });

    // Simulate another terminal by rewriting owner
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    await db.orders.put({
      ...order,
      owner_terminal_id: 'terminal-other',
      owner_heartbeat_at: new Date().toISOString(),
    });

    await expect(posStore.mergeOrder(order.id, { notes: 'x' })).rejects.toMatchObject({
      code: 'NOT_OWNER',
    });
  });

  it('auto-takes ownership on merge while online', async () => {
    resetPosStoreConnectivityForTests(true);
    const { order } = await posStore.createOrderWithItems({
      items: [{ dishId: 'menu_item:d', price: 5, quantity: 1 }],
    });
    const identity = await posStore.getTerminalIdentity();
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    await db.orders.put({
      ...order,
      owner_terminal_id: 'terminal-other',
      owner_heartbeat_at: new Date().toISOString(),
    });

    const next = await posStore.mergeOrder(order.id, { notes: 'online takeover' });
    expect(next.owner_terminal_id).toBe(identity.terminalId);
    expect(next.notes).toBe('online takeover');
  });

  it('allows steal when owner heartbeat is stale', async () => {
    const { order } = await posStore.createOrderWithItems({
      items: [{ dishId: 'menu_item:d', price: 5, quantity: 1 }],
    });
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const staleAt = new Date(Date.now() - OWNER_HEARTBEAT_STALE_MS - 1000).toISOString();
    await db.orders.put({
      ...order,
      owner_terminal_id: 'terminal-other',
      owner_heartbeat_at: staleAt,
    });

    const stolen = await posStore.stealOrder(order.id);
    const identity = await posStore.getTerminalIdentity();
    expect(stolen.owner_terminal_id).toBe(identity.terminalId);
  });

  it('detects stale heartbeats', () => {
    expect(
      isOwnerHeartbeatStale({
        owner_heartbeat_at: new Date(Date.now() - OWNER_HEARTBEAT_STALE_MS - 1).toISOString(),
      }),
    ).toBe(true);
    expect(
      canStealOrder(
        {
          id: 'order:1',
          status: 'In Progress',
          items: [],
          created_at: new Date().toISOString(),
          owner_terminal_id: 'other',
          owner_heartbeat_at: new Date().toISOString(),
          server_version: 1,
        },
        'me',
      ),
    ).toBe(false);
  });

  it('completes kitchen stages without ownership', async () => {
    const { kitchens } = await posStore.createOrderWithItems({
      items: [
        {
          dishId: 'menu_item:d',
          price: 5,
          quantity: 1,
          kitchenStages: [
            {
              kitchenId: 'kitchen:k1',
              sequence: 0,
              isTerminal: true,
              status: 'pending',
            },
          ],
        },
      ],
    });
    await posStore.completeKitchenStage({ kitchenRowId: kitchens[0].id });
    const pending = await posStore.getPendingOutbox();
    expect(pending.some((p) => p.operation?.operationType === 'COMPLETE_KITCHEN_STAGE')).toBe(
      true,
    );
  });
});

describe('PosStore void + taxes (Phase 2)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    resetPosStoreConnectivityForTests(true);
    await posStore.initialize();
    await posStore.upsertCatalogRecords('tax', [{ id: 'tax:vat', name: 'VAT', rate: 10 }]);
    await posStore.upsertCatalogRecords('menu_item', [{ id: 'menu_item:d1', name: 'Dish', taxes: ['tax:vat'] }]);
  });

  const createTwoLines = () =>
    posStore.createOrderWithItems({
      invoiceNumber: 1,
      items: [
        { dishId: 'menu_item:d1', price: 10, quantity: 2, taxes: ['tax:vat'], taxMode: 'inclusive',
          kitchenStages: [{ kitchenId: 'kitchen:k1', sequence: 0, isTerminal: true, status: 'pending' }] },
        { dishId: 'menu_item:d1', price: 5, quantity: 1, taxes: ['tax:vat'], taxMode: 'inclusive' },
      ],
    });

  it('voids a partial quantity, records the void, recomputes taxes and stays open', async () => {
    const { order, items } = await createTwoLines();
    const result = await posStore.voidOrderItems({
      orderId: order.id,
      lines: [{ itemId: items[0].id, quantity: 1 }],
      reason: 'Spill',
      userId: 'user:u1',
    });
    expect(result.allVoided).toBe(false);
    expect(result.order.status).toBe('In Progress');
    expect(result.voids).toHaveLength(1);
    expect(result.voids[0].items).toEqual([items[0].id]);

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const line = await db.orderItems.get(items[0].id);
    expect(line?.quantity).toBe(1);
    expect(line?.deleted_at).toBeUndefined();
    // 10 + 5 remaining at 10% VAT
    expect(result.taxAmount).toBe(1.5);
    const taxes = await db.orderTaxes.where('order').equals(order.id).toArray();
    expect(taxes).toHaveLength(1);
    expect(taxes[0].id).toBe(`order_tax:${order.id.split(':')[1]}_vat`);

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const types = ops.map((op) => op.operationType);
    expect(types).toContain('CREATE_RECORD'); // order + void
    expect(ops.some((op) => op.operationType === 'MERGE_RECORD' && op.payload.table === 'order_item')).toBe(true);
    const voidOp = ops.find((op) => op.payload.table === 'order_void');
    expect(voidOp?.payload.orderId).toBe(order.id);
    const replace = ops.find((op) => op.operationType === 'REPLACE_ORDER_RELATION');
    expect(replace?.payload.relation).toBe('order_taxes');
    expect(replace?.payload.rows).toHaveLength(1);
    expect(replace?.payload.data.tax_amount).toBe(1.5);
  });

  it('voiding every line cancels the order, cancels pending kitchen rows and clears taxes', async () => {
    const { order, items, kitchens } = await createTwoLines();
    const result = await posStore.voidOrderItems({
      orderId: order.id,
      lines: items.map((item) => ({ itemId: item.id, quantity: item.quantity })),
      reason: 'Customer left',
      userId: 'user:u1',
    });
    expect(result.allVoided).toBe(true);
    expect(result.order.status).toBe('Cancelled');
    expect(result.order.tags).toContain('Cancelled');
    expect(result.taxAmount).toBe(0);
    expect(result.removedItemIds.sort()).toEqual(items.map((i) => i.id).sort());

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const stage = await db.orderItemKitchens.get(kitchens[0].id);
    expect(stage?.status).toBe('cancelled');
    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const kitchenOp = ops.find((op) => op.payload.table === 'order_item_kitchen');
    expect(kitchenOp?.payload.data.status).toBe('cancelled');
    const replace = ops.find((op) => op.operationType === 'REPLACE_ORDER_RELATION');
    expect(replace?.payload.data.status).toBe('Cancelled');
    expect(replace?.payload.rows).toHaveLength(0);
  });

  it('rejects voids from a non-owner terminal while offline', async () => {
    resetPosStoreConnectivityForTests(false);
    const { order, items } = await createTwoLines();
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    await db.orders.put({ ...order, owner_terminal_id: 'terminal-other' });
    await expect(
      posStore.voidOrderItems({ orderId: order.id, lines: [{ itemId: items[0].id, quantity: 1 }], reason: 'x', userId: 'user:u1' }),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' });
  });
});

describe('PosStore draft + settle (Phase 3)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
    await posStore.upsertCatalogRecords('tax', [{ id: 'tax:vat', name: 'VAT', rate: 10 }]);
    await posStore.upsertCatalogRecords('coupon', [{ id: 'coupon:c1', code: 'TEN' }]);
  });

  const createOrder = () =>
    posStore.createOrderWithItems({
      invoiceNumber: 7,
      items: [{ dishId: 'menu_item:d1', price: 20, quantity: 1, taxes: ['tax:vat'], taxMode: 'inclusive' }],
    });

  it('keeps draft payments local and pushes only non-financial fields', async () => {
    const { order } = await createOrder();
    const draft = [{ id: 'abc', amount: 5, payment_type: { id: 'payment_type:cash', name: 'Cash' } }];
    const next = await posStore.saveOrderDraft(order.id, {
      draft_payments: draft,
      tip: 2,
      tip_amount: 2,
      notes: 'no onions',
      extras: [{ id: 'order_extras:x_bag', name: 'bag', value: 1 }],
      coupon: { couponId: 'coupon:c1', discount: 3 },
    });
    expect(next.draft_payments).toEqual(draft);
    expect(next.notes).toBe('no onions');
    expect(next.coupon).toBe(`order_coupon:${order.id.split(':')[1]}_c1`);
    expect(next.extras).toEqual(['order_extras:x_bag']);

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const merge = ops.find((op) => op.operationType === 'MERGE_RECORD' && op.payload.table === 'order');
    expect(merge?.payload.data.draft_payments).toBeUndefined();
    expect(merge?.payload.data.tip).toBe(2);
    expect(ops.find((op) => op.payload.table === 'order_coupon')?.payload.linkField).toBe('coupon');
    expect(ops.find((op) => op.operationType === 'REPLACE_ORDER_RELATION')?.payload.relation).toBe('extras');
  });

  it('settles with immutable payment rows, Paid status and a coupon redemption', async () => {
    const { order } = await createOrder();
    await posStore.saveOrderDraft(order.id, { coupon: { couponId: 'coupon:c1', discount: 3 } });
    const result = await posStore.settleOrder({
      orderId: order.id,
      payments: [
        { id: 'p1', paymentTypeId: 'payment_type:cash', amount: 10, payable: 19 },
        { id: 'p2', paymentTypeId: 'payment_type:card', amount: 9, payable: 19 },
      ],
      cashierId: 'user:u1',
      tip: 0,
      couponRedemption: { userId: 'user:u1', discountAmount: 3 },
    });
    expect(result.order.status).toBe('Paid');
    expect(result.order.tags).toContain('Paid');
    expect(result.order.cashier).toBe('user:u1');
    expect(result.order.completed_at).toBeTruthy();
    expect(result.payments.map((p) => p.id).sort()).toEqual(['order_payment:p1', 'order_payment:p2']);
    expect(result.order.payments).toEqual(expect.arrayContaining(['order_payment:p1', 'order_payment:p2']));
    expect((result.order as any).draft_payments).toBeUndefined();

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    expect(ops.filter((op) => op.operationType === 'CREATE_PAYMENT')).toHaveLength(2);
    expect(ops.find((op) => op.payload.table === 'coupon_redemption')?.payload.data.coupon).toBe('coupon:c1');
    // tax rows recomputed: 20 inclusive @10% => 2.0
    const replace = ops.filter((op) => op.operationType === 'REPLACE_ORDER_RELATION' && op.payload.relation === 'order_taxes').pop();
    expect(replace?.payload.data.tax_amount).toBe(2);

    await expect(
      posStore.settleOrder({ orderId: order.id, payments: [{ paymentTypeId: 'payment_type:cash', amount: 1, payable: 1 }] }),
    ).rejects.toMatchObject({ code: 'ALREADY_CLOSED' });
  });

  it('settle with keepTaxes+skipDraft skips tax REPLACE and only enqueues payments + Paid', async () => {
    const { order } = await createOrder();
    await posStore.recomputeOrderTaxes(order.id);
    const beforeOps = (await posStore.getPendingOutbox()).length;

    await posStore.settleOrder({
      orderId: order.id,
      payments: [{ paymentTypeId: 'payment_type:cash', amount: 20, payable: 20 }],
      cashierId: 'user:u1',
      keepTaxes: true,
      skipDraft: true,
    });

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const newOps = ops.slice(beforeOps);
    expect(newOps.some((op) => op.operationType === 'REPLACE_ORDER_RELATION')).toBe(false);
    expect(newOps.filter((op) => op.operationType === 'CREATE_PAYMENT')).toHaveLength(1);
    expect(newOps.some((op) => op.payload?.data?.status === 'Paid')).toBe(true);
    expect((await posStore.getOrder(order.id))?.status).toBe('Paid');
  });
});

describe('PosStore refund (Phase 4)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
  });

  it('refunds selected lines, tags the order and releases ownership after settle', async () => {
    const { order, items } = await posStore.createOrderWithItems({
      invoiceNumber: 9,
      items: [
        { dishId: 'menu_item:d1', price: 10, quantity: 1 },
        { dishId: 'menu_item:d2', price: 5, quantity: 1 },
      ],
    });
    const settled = await posStore.settleOrder({
      orderId: order.id,
      payments: [{ paymentTypeId: 'payment_type:cash', amount: 15, payable: 15 }],
    });
    expect(settled.order.owner_terminal_id).toBeNull();

    // Another terminal picks the closed check up: no NOT_OWNER.
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const partial = await posStore.refundOrder({
      orderId: order.id,
      itemIds: [items[0].id],
      reason: 'Cold',
      userId: 'user:u1',
      managerId: 'user:m1',
    });
    expect(partial.fullRefund).toBe(false);
    expect(partial.order.status).toBe('Paid');
    expect(partial.order.tags).toContain('Refunded');
    expect(partial.refund.items).toEqual([items[0].id]);
    expect((await db.orderItems.get(items[0].id))?.is_refunded).toBe(true);

    const full = await posStore.refundOrder({ orderId: order.id, itemIds: [items[1].id], userId: 'user:u1' });
    expect(full.fullRefund).toBe(true);
    expect(full.order.status).toBe('Refunded');

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    expect(ops.filter((op) => op.payload.table === 'order_refund')).toHaveLength(2);
    expect(ops.filter((op) => op.operationType === 'MERGE_RECORD' && op.payload.table === 'order_item' && op.payload.data.is_refunded)).toHaveLength(2);
  });
});

describe('PosStore split + merge (Phase 5)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
  });

  it('splits by items: children own moved lines, parent is Spilt with no items', async () => {
    const { order, items } = await posStore.createOrderWithItems({
      invoiceNumber: 20,
      covers: 4,
      items: [
        { dishId: 'menu_item:d1', price: 10, quantity: 1 },
        { dishId: 'menu_item:d2', price: 5, quantity: 1 },
      ],
    });
    const { parent, children } = await posStore.splitOrder({
      parentId: order.id,
      mode: 'seats',
      userId: 'user:u1',
      groups: [
        { itemIds: [items[0].id], seat: '1', invoiceNumber: 21, autoId: 101, order: { covers: 2, split: 1 } },
        { itemIds: [items[1].id], seat: '2', invoiceNumber: 22, autoId: 102, order: { covers: 2, split: 2 } },
      ],
    });
    expect(parent.status).toBe('Spilt');
    expect(parent.items).toEqual([]);
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.invoice_number)).toEqual([21, 22]);
    expect(children[0].items).toEqual([items[0].id]);
    expect(children[0].covers).toBe(2);
    expect(children[0].owner_terminal_id).toBeTruthy();

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const moved = await db.orderItems.get(items[1].id);
    expect(moved?.order).toBe(children[1].id);
    expect(moved?.seat).toBe('2');
    expect(await db.orderSplits.count()).toBe(1);

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const childCreates = ops.filter((op) => op.operationType === 'CREATE_RECORD' && op.payload.table === 'order' && op.payload.recordId !== order.id);
    expect(childCreates).toHaveLength(2);
    expect(childCreates[0].payload.data.items).toEqual([items[0].id]);
    const parentMerge = ops.find((op) => op.operationType === 'MERGE_RECORD' && op.payload.recordId === order.id);
    expect(parentMerge?.payload.data.status).toBe('Spilt');
    expect(parentMerge?.payload.replaceItems).toEqual([]);
    expect(ops.find((op) => op.payload.table === 'order_split')?.payload.data.new_orders).toEqual(children.map((c) => c.id));
  });

  it('splits by amount: clones pro-rata lines onto each child', async () => {
    const { order } = await posStore.createOrderWithItems({
      invoiceNumber: 30,
      items: [{ dishId: 'menu_item:d1', price: 10, quantity: 2 }],
    });
    const { children } = await posStore.splitOrder({
      parentId: order.id,
      mode: 'amount',
      userId: 'user:u1',
      groups: [
        { newItems: [{ dishId: 'menu_item:d1', price: 5, quantity: 2, serviceCharges: 0.5 }], invoiceNumber: 31 },
        { newItems: [{ dishId: 'menu_item:d1', price: 5, quantity: 2 }], invoiceNumber: 32 },
      ],
    });
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const childItems = await db.orderItems.where('order').equals(children[0].id).toArray();
    expect(childItems).toHaveLength(1);
    expect(childItems[0].price).toBe(5);
    expect(childItems[0].service_charges).toBe(0.5);
    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const create = ops.find((op) => op.payload.recordId === children[0].id);
    expect(create?.payload.items).toHaveLength(1);
  });

  it('merges two orders into a new check and closes the sources', async () => {
    const a = await posStore.createOrderWithItems({ invoiceNumber: 40, covers: 2, items: [{ dishId: 'menu_item:d1', price: 1, quantity: 1 }] });
    const b = await posStore.createOrderWithItems({ invoiceNumber: 41, covers: 3, items: [{ dishId: 'menu_item:d2', price: 2, quantity: 1 }] });
    const { merged, sources } = await posStore.mergeOrders({
      sourceIds: [a.order.id, b.order.id],
      invoiceNumber: 42,
      autoId: 900,
      userId: 'user:u1',
      target: { table: 'floor_table:t9', covers: 5 },
    });
    expect(merged.invoice_number).toBe(42);
    expect(merged.table).toBe('floor_table:t9');
    expect(merged.items.sort()).toEqual([a.items[0].id, b.items[0].id].sort());
    expect(sources.every((s) => s.status === 'Merged')).toBe(true);

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    expect((await db.orders.get(a.order.id))?.status).toBe('Merged');
    expect((await db.orderItems.get(b.items[0].id))?.order).toBe(merged.id);
    const open = await posStore.getOpenOrders();
    expect(open.map((o) => o.id)).toEqual([merged.id]);

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    expect(ops.filter((op) => op.operationType === 'MERGE_RECORD' && op.payload.table === 'order' && op.payload.data.status === 'Merged')).toHaveLength(2);
    expect(ops.find((op) => op.payload.table === 'order_merge')?.payload.data.old_orders).toEqual([a.order.id, b.order.id]);
  });
});

describe('PosStore kitchen fire + KDS (Phase 6)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
    await posStore.upsertCatalogRecords('menu_item', [{ id: 'menu_item:d1', name: 'Dish' }]);
    await posStore.upsertCatalogRecords('kitchen', [{ id: 'kitchen:k1', name: 'Grill' }, { id: 'kitchen:k2', name: 'Pass' }]);
  });

  it('fires a held line: un-suspends it and creates stage rows in one op', async () => {
    const { order, items } = await posStore.createOrderWithItems({
      invoiceNumber: 50,
      items: [{ dishId: 'menu_item:d1', price: 1, quantity: 1, isHold: true }],
    });
    expect(items[0].is_suspended).toBe(true);
    const fired = await posStore.fireOrderItems({
      orderId: order.id,
      items: [{
        itemId: items[0].id,
        kitchenStages: [
          { kitchenId: 'kitchen:k1', sequence: 0, isTerminal: false, status: 'pending', workflowId: 'workflow:w1' },
          { kitchenId: 'kitchen:k2', sequence: 1, isTerminal: true, status: 'waiting', workflowId: 'workflow:w1' },
        ],
      }],
    });
    expect(fired.items[0].is_suspended).toBe(false);
    expect(fired.items[0].workflow).toBe('workflow:w1');
    expect(fired.kitchens).toHaveLength(2);
    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const merge = ops.find((op) => op.operationType === 'MERGE_RECORD' && op.payload.table === 'order_item');
    expect(merge?.payload.data.is_suspended).toBe(false);
    expect(merge?.payload.kitchens).toHaveLength(2);

    const rows = await posStore.getKitchenRowsHydrated('kitchen:k1');
    expect(rows).toHaveLength(1);
    expect(rows[0].order_item.item.name).toBe('Dish');
    expect(rows[0].order_item.order.id).toBe(order.id);
  });

  it('completes a stage per user and advances the workflow to the next kitchen', async () => {
    const { items, kitchens } = await posStore.createOrderWithItems({
      invoiceNumber: 51,
      items: [{
        dishId: 'menu_item:d1', price: 1, quantity: 1,
        kitchenStages: [
          { kitchenId: 'kitchen:k1', sequence: 0, isTerminal: false, status: 'pending', workflowId: 'workflow:w1' },
          { kitchenId: 'kitchen:k2', sequence: 1, isTerminal: true, status: 'waiting', workflowId: 'workflow:w1' },
        ],
      }],
    });
    const first = kitchens.find((k) => k.kitchen === 'kitchen:k1')!;
    const second = kitchens.find((k) => k.kitchen === 'kitchen:k2')!;

    const result = await posStore.completeKitchenStages({ kitchenRowIds: [first.id], userId: 'user:cook' });
    expect(result.completed[0].status).toBe('completed');
    expect((result.completed[0] as any).completed_by).toEqual(['user:cook']);
    expect(result.activated.map((r) => r.id)).toEqual([second.id]);

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    expect((await db.orderItemKitchens.get(second.id))?.status).toBe('pending');
    expect((await db.orderItems.get(items[0].id))?.current_sequence).toBe(1);

    // A second user completing the same (already completed) row only joins completed_by.
    const again = await posStore.completeKitchenStages({ kitchenRowIds: [first.id], userId: 'user:chef' });
    expect(again.activated).toHaveLength(0);
    expect((again.completed[0] as any).completed_by).toEqual(['user:cook', 'user:chef']);

    // Recall removes only that user.
    const recalled = await posStore.recallKitchenStage({ kitchenRowId: first.id, userId: 'user:cook' });
    expect((recalled as any).completed_by).toEqual(['user:chef']);

    // Completing the terminal stage marks the item's workflow completed.
    await posStore.completeKitchenStages({ kitchenRowIds: [second.id], userId: 'user:cook' });
    expect((await db.orderItems.get(items[0].id))?.workflow_status).toBe('completed');

    const ops = (await posStore.getPendingOutbox()).map((row) => row.operation!);
    const itemPatches = ops.filter((op) => op.operationType === 'MERGE_RECORD' && op.payload.table === 'order_item');
    // Kitchen-driven item patches carry no orderId (no cashier ownership gate).
    expect(itemPatches.every((op) => op.payload.orderId === undefined)).toBe(true);
  });
});

describe('PosStore outbox retry / backoff / conflicts (Phase 8)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
  });

  const createOne = () =>
    posStore.createOrderWithItems({
      invoiceNumber: 7,
      items: [{ dishId: 'menu_item:d1', price: 4, quantity: 1 }],
    });

  it('backs off exponentially on transport failure and flags rows failed after max attempts', async () => {
    await createOne();
    const ids = (await posStore.getPendingOutbox()).map((row) => row.operationId);
    expect(ids.length).toBeGreaterThan(0);
    expect(await posStore.getOutboxBackoffUntil()).toBeNull();

    await posStore.markOutboxPushFailed(ids, 'ECONNREFUSED');
    const after1 = await posStore.getPendingOutbox();
    expect(after1.every((row) => row.attempts === 1 && row.status === 'pending')).toBe(true);
    expect(after1.every((row) => row.lastError === 'ECONNREFUSED')).toBe(true);
    const until1 = await posStore.getOutboxBackoffUntil();
    expect(until1).not.toBeNull();
    const delay1 = new Date(until1!).getTime() - Date.now();
    expect(delay1).toBeGreaterThan(1_000);
    expect(delay1).toBeLessThanOrEqual(2_000);

    await posStore.markOutboxPushFailed(ids, 'ECONNREFUSED');
    const delay2 = new Date((await posStore.getOutboxBackoffUntil())!).getTime() - Date.now();
    expect(delay2).toBeGreaterThan(delay1);

    for (let i = 0; i < 6; i += 1) await posStore.markOutboxPushFailed(ids, 'ECONNREFUSED');
    const exhausted = await posStore.getPendingOutbox();
    expect(exhausted.every((row) => row.attempts === 8 && row.status === 'failed')).toBe(true);
    // failed rows are still part of the pending set so they keep being retried
    expect(exhausted.length).toBe(ids.length);
  });

  it('records a conflict with aggregate details, then retry re-queues and discard drops it', async () => {
    const { order } = await createOne();
    const [first] = await posStore.getPendingOutbox();
    await posStore.markOutboxConflict(first.operationId, 'VERSION_CONFLICT', 'Order is at version 3');

    const conflicts = await posStore.getOpenConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      operationId: first.operationId,
      code: 'VERSION_CONFLICT',
      aggregateType: 'order',
      aggregateId: order.id,
      operationType: first.operation!.operationType,
    });
    expect((await posStore.getPendingOutbox()).some((row) => row.operationId === first.operationId)).toBe(false);

    await posStore.retryConflict(first.operationId);
    expect(await posStore.getOpenConflicts()).toHaveLength(0);
    const requeued = (await posStore.getPendingOutbox()).find((row) => row.operationId === first.operationId);
    expect(requeued).toMatchObject({ status: 'pending', attempts: 0 });

    await posStore.markOutboxConflict(first.operationId, 'NOT_OWNER', 'Order owned by other');
    await posStore.discardConflict(first.operationId);
    expect(await posStore.getOpenConflicts()).toHaveLength(0);
    expect((await posStore.getPendingOutbox()).some((row) => row.operationId === first.operationId)).toBe(false);
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    expect((await db.syncOutbox.get(first.operationId))?.status).toBe('discarded');
    // The domain operation is kept for audit.
    expect(await db.domainOperations.get(first.operationId)).toBeTruthy();
  });

  it('retryAllConflicts re-queues every open conflict with refreshed expectedVersion', async () => {
    const a = await createOne();
    const b = await createOne();
    const pending = await posStore.getPendingOutbox();
    const opA = pending.find((row) => row.operation?.aggregateId === a.order.id)!;
    const opB = pending.find((row) => row.operation?.aggregateId === b.order.id)!;

    await posStore.markOutboxConflict(opA.operationId, 'VERSION_CONFLICT', 'stale a');
    await posStore.markOutboxConflict(opB.operationId, 'VERSION_CONFLICT', 'stale b');
    expect(await posStore.getOpenConflicts()).toHaveLength(2);

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    await db.orders.put({ ...(await db.orders.get(a.order.id))!, server_version: 7 });
    await db.orders.put({ ...(await db.orders.get(b.order.id))!, server_version: 9 });

    const count = await posStore.retryAllConflicts();
    expect(count).toBe(2);
    expect(await posStore.getOpenConflicts()).toHaveLength(0);

    const outbox = await posStore.getPendingOutbox();
    expect(outbox.some((row) => row.operationId === opA.operationId && row.status === 'pending')).toBe(true);
    expect(outbox.some((row) => row.operationId === opB.operationId && row.status === 'pending')).toBe(true);
    expect((await db.domainOperations.get(opA.operationId))?.expectedVersion).toBe(7);
    expect((await db.domainOperations.get(opB.operationId))?.expectedVersion).toBe(9);
  });
});

describe('PosStore clearLocalData (Reload cache)', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
  });

  it('keeps terminal identity, wipes orders/outbox/catalog and marks unhydrated', async () => {
    const identity = await posStore.getTerminalIdentity();
    await posStore.upsertCatalogRecords('tax', [{ id: 'tax:vat', name: 'VAT', rate: 10 }]);
    await posStore.createOrderWithItems({
      invoiceNumber: 99,
      items: [{ dishId: 'menu_item:d1', price: 8, quantity: 1 }],
    });
    expect((await posStore.getPendingOutbox()).length).toBeGreaterThan(0);
    expect((await posStore.getOpenOrders()).length).toBe(1);

    await posStore.clearLocalData();

    const afterIdentity = await posStore.getTerminalIdentity();
    expect(afterIdentity.terminalId).toBe(identity.terminalId);

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    expect(await db.orders.count()).toBe(0);
    expect(await db.orderItems.count()).toBe(0);
    expect(await db.catalog.count()).toBe(0);
    expect(await db.domainOperations.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(0);
    expect(await db.numberReservations.count()).toBe(0);

    const cursor = await posStore.getSyncCursor();
    expect(cursor).toMatchObject({
      hydrated: false,
      cursor: 0,
      snapshotResumeToken: null,
    });
    expect(await posStore.getPendingOutbox()).toHaveLength(0);
    expect(await posStore.getOpenOrders()).toHaveLength(0);
  });
});

describe('PosStore settle + conflict retry', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
    await posStore.storeNumberReservations('invoice', 1, 50);
    await posStore.storeNumberReservations('auto_id', 1, 50);
  });

  it('chains expectedVersion across CREATE_PAYMENT then Paid MERGE', async () => {
    const { order } = await posStore.createOrderWithItems({
      invoiceNumber: 11,
      items: [{ dishId: 'menu_item:d1', price: 20, quantity: 1, taxMode: 'inclusive', taxes: [] }],
    });
    const before = (await posStore.getOrder(order.id))!.server_version;
    await posStore.settleOrder({
      orderId: order.id,
      cashierId: 'user:u1',
      keepTaxes: true,
      payments: [
        { id: 'p1', amount: 10, payable: 20, paymentTypeId: 'payment_type:cash' },
        { id: 'p2', amount: 10, payable: 20, paymentTypeId: 'payment_type:card' },
      ],
    });
    const ops = (await posStore.getPendingOutbox())
      .map((row) => row.operation!)
      .filter((op) => op.aggregateId === order.id && (op.operationType === 'CREATE_PAYMENT' || (op.operationType === 'MERGE_RECORD' && op.payload?.data?.status === 'Paid')));
    const payments = ops.filter((op) => op.operationType === 'CREATE_PAYMENT');
    const paid = ops.find((op) => op.operationType === 'MERGE_RECORD');
    expect(payments).toHaveLength(2);
    expect(payments[0].expectedVersion).toBe(before);
    expect(payments[1].expectedVersion).toBe(before + 1);
    expect(paid?.expectedVersion).toBe(before + 2);
    expect((await posStore.getOrder(order.id))?.status).toBe('Paid');
  });

  it('retryConflict refreshes expectedVersion from the local order', async () => {
    const { order } = await posStore.createOrderWithItems({
      invoiceNumber: 12,
      items: [{ dishId: 'menu_item:d1', price: 5, quantity: 1 }],
    });
    const [first] = await posStore.getPendingOutbox();
    await posStore.markOutboxConflict(first.operationId, 'VERSION_CONFLICT', 'behind');
    // Advance local version as if later ops succeeded.
    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const current = await db.orders.get(order.id);
    await db.orders.put({ ...current!, server_version: 42 });

    await posStore.retryConflict(first.operationId);
    const op = await db.domainOperations.get(first.operationId);
    expect(op?.expectedVersion).toBe(42);
    expect((await posStore.getPendingOutbox()).some((row) => row.operationId === first.operationId)).toBe(true);
  });
});

describe('PosStore table locks', () => {
  beforeEach(async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
  });

  it('does not re-lock after unlock when a heartbeat was already in flight', async () => {
    const tableId = 'floor_table:t-lock';
    await posStore.lockTable(tableId, 'Cashier One');

    // Simulate the old TOCTOU: read-then-write heartbeat overlapping unlock.
    // Atomic heartbeat must observe unlock and leave the table unlocked.
    await posStore.unlockTable(tableId);
    const afterHeartbeat = await posStore.heartbeatTableLock(tableId);

    expect(afterHeartbeat?.is_locked ?? false).toBe(false);
    const stored = await posStore.getTableLock(tableId);
    expect(stored?.is_locked).toBe(false);
    expect(stored?.locked_by).toBeNull();
  });

  it('heartbeats only while the table is still locked', async () => {
    const tableId = 'floor_table:t-lock-2';
    await posStore.lockTable(tableId, 'Cashier Two');
    const beat = await posStore.heartbeatTableLock(tableId);
    expect(beat?.is_locked).toBe(true);
    expect(beat?.locked_by).toBe('Cashier Two');
    expect(beat?.locked_at).toBeTruthy();
  });
});
