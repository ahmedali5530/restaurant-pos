import { describe, expect, it } from 'vitest';
import {
  getOpenOrdersHydrated,
  loadHydratedCatalog,
  upsertCatalogRecords,
} from '@/infrastructure/pos-store/catalog.ts';
import { resetPosStoreDatabaseForTests } from '@/infrastructure/pos-store/db.ts';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import { getOrderSettlementFigures } from '@/lib/order.ts';

describe('open order hydration', () => {
  it('joins items, dishes, taxes, user, table and order type into the FETCH shape', async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
    await upsertCatalogRecords('user', [{ id: 'user:u1', first_name: 'Ada', last_name: 'L' }]);
    await upsertCatalogRecords('tax', [{ id: 'tax:t1', name: 'VAT', rate: 10 }]);
    await upsertCatalogRecords('floor', [{ id: 'floor:f1', name: 'Main' }]);
    await upsertCatalogRecords('floor_table', [
      { id: 'floor_table:t1', name: 'T', number: '1', floor: 'floor:f1' },
    ]);
    await upsertCatalogRecords('order_type', [{ id: 'order_type:o1', name: 'Dine in' }]);
    await upsertCatalogRecords('menu_item', [
      { id: 'menu_item:d1', name: 'Soup', price: 5, tax: 'tax:t1', taxes: ['tax:t1'] },
    ]);

    const { order } = await posStore.createOrderWithItems({
      invoiceNumber: 7,
      floorId: 'floor:f1',
      tableId: 'floor_table:t1',
      orderTypeId: 'order_type:o1',
      userId: 'user:u1',
      items: [
        { dishId: 'menu_item:d1', price: 5, quantity: 2, taxes: ['tax:t1'], seat: 'seatA' },
        { dishId: 'menu_item:d1', price: 5, quantity: 1 },
      ],
    });

    const [hydrated] = await getOpenOrdersHydrated();
    expect(String(hydrated.id)).toBe(order.id);
    expect(hydrated.user.first_name).toBe('Ada');
    expect(hydrated.table.name).toBe('T');
    expect(hydrated.table.floor.name).toBe('Main');
    expect(hydrated.order_type.name).toBe('Dine in');
    expect(hydrated.items).toHaveLength(2);
    expect(hydrated.items[0].item.name).toBe('Soup');
    expect(hydrated.items[0].taxes[0].name).toBe('VAT');
    expect(hydrated.items[0].seat).toBe('seatA');
    // Unseated lines must be `undefined` so the cart's `item.seat === state.seat` matches.
    expect(hydrated.items[1].seat).toBeUndefined();
    expect('seat' in hydrated.items[1] && hydrated.items[1].seat === null).toBe(false);
    expect(hydrated.items.map((item: any) => item.position)).toEqual([0, 1]);
    expect(hydrated.payments).toEqual([]);
    expect(hydrated.owner_terminal_id).toBe(order.owner_terminal_id);
    expect(getOrderSettlementFigures(hydrated as any).itemsTotal).toBe(15);
  });
});

describe('catalog hydration', () => {
  it('joins workflows onto dishes without FETCH', async () => {
    resetPosStoreDatabaseForTests();
    await upsertCatalogRecords('kitchen', [{ id: 'kitchen:k1', name: 'Hot' }]);
    await upsertCatalogRecords('workflow', [{ id: 'workflow:w1', name: 'Default' }]);
    await upsertCatalogRecords('workflow_stage', [
      {
        id: 'workflow_stage:s1',
        workflow: 'workflow:w1',
        kitchen: 'kitchen:k1',
        sequence: 1,
        name: 'Cook',
        is_terminal: true,
      },
    ]);
    await upsertCatalogRecords('menu_item', [
      { id: 'menu_item:d1', name: 'Soup', workflow: 'workflow:w1', price: 5 },
    ]);

    const catalog = await loadHydratedCatalog();
    expect(catalog.dishes[0].workflow.stages[0].kitchen.name).toBe('Hot');
  });

  it('joins floor onto tables without FETCH', async () => {
    resetPosStoreDatabaseForTests();
    await upsertCatalogRecords('floor', [{ id: 'floor:f1', name: 'Main' }]);
    await upsertCatalogRecords('floor_table', [
      { id: 'floor_table:t1', name: 'T1', number: '1', floor: 'floor:f1' },
    ]);

    const catalog = await loadHydratedCatalog();
    expect(catalog.tables[0].floor.id).toBe('floor:f1');
    expect(catalog.tables[0].floor.name).toBe('Main');
  });

  it('hydrates payment types, extras, discounts, settings and redacts users', async () => {
    resetPosStoreDatabaseForTests();
    await upsertCatalogRecords('tax', [{ id: 'tax:vat', name: 'VAT', rate: 10, priority: 1 }]);
    await upsertCatalogRecords('payment_type', [
      { id: 'payment_type:cash', name: 'Cash', tax: 'tax:vat', priority: 1 },
      { id: 'payment_type:gone', name: 'Gone', deleted_at: '2026-01-01T00:00:00.000Z' },
    ]);
    await upsertCatalogRecords('order_type', [{ id: 'order_type:dine', name: 'Dine' }]);
    await upsertCatalogRecords('floor_table', [
      {
        id: 'floor_table:t1',
        name: 'T1',
        payment_types: ['payment_type:cash'],
      },
    ]);
    await upsertCatalogRecords('extra', [
      {
        id: 'extra:svc',
        name: 'Service',
        value: 2,
        apply_to_all: true,
        payment_types: ['payment_type:cash'],
        order_types: ['order_type:dine'],
        tables: ['floor_table:t1'],
      },
    ]);
    await upsertCatalogRecords('discount', [
      { id: 'discount:d1', name: 'Happy hour', is_active: true, priority: 2 },
      { id: 'discount:off', name: 'Off', is_active: false },
    ]);
    await upsertCatalogRecords('setting', [
      { id: 'setting:sc', key: 'service_charges', is_global: true, values: { value: 5, type: 'percent' } },
    ]);
    await upsertCatalogRecords('user', [
      { id: 'user:u1', first_name: 'Ada', last_name: 'L', password: 'secret', pin: '1234' },
    ]);
    await upsertCatalogRecords('coupon', [
      { id: 'coupon:c1', code: 'SAVE10', is_active: true },
    ]);

    const catalog = await loadHydratedCatalog();
    expect(catalog.payment_types).toHaveLength(1);
    expect(catalog.payment_types[0].tax.name).toBe('VAT');
    expect(catalog.tables[0].payment_types[0].tax.name).toBe('VAT');
    expect(catalog.extras[0].payment_types[0].id).toBe('payment_type:cash');
    expect(catalog.discounts.map((d: any) => d.id)).toEqual(['discount:d1']);
    expect(catalog.settings[0].key).toBe('service_charges');
    expect(catalog.users[0].password).toBeUndefined();
    expect(catalog.users[0].pin).toBeUndefined();
    expect(catalog.coupons[0].code).toBe('SAVE10');
  });

  it('hydrates dish modifier groups and modifier dishes without FETCH', async () => {
    resetPosStoreDatabaseForTests();
    await upsertCatalogRecords('menu_item', [
      { id: 'menu_item:pizza', name: 'Pizza' },
      { id: 'menu_item:cheese', name: 'Extra cheese' },
    ]);
    await upsertCatalogRecords('modifier_group', [
      {
        id: 'modifier_group:toppings',
        name: 'Toppings',
        priority: 1,
        modifiers: ['modifier:cheese'],
      },
      { id: 'modifier_group:nested', name: 'Nested', priority: 2, modifiers: [] },
    ]);
    await upsertCatalogRecords('modifier', [
      {
        id: 'modifier:cheese',
        modifier: 'menu_item:cheese',
        price: 2,
        allowed_next_groups: ['modifier_group:nested'],
      },
    ]);
    await upsertCatalogRecords('menu_item_modifier_group', [
      {
        id: 'menu_item_modifier_group:pizza-toppings',
        in: 'menu_item:pizza',
        out: 'modifier_group:toppings',
        priority: 1,
        has_required_modifiers: true,
        required_modifiers: 1,
        should_auto_open: true,
      },
    ]);

    const catalog = await loadHydratedCatalog();
    const edge = catalog.groups_dishes[0];
    const modifier = edge.out.modifiers[0];

    expect(edge.in).toMatchObject({ id: 'menu_item:pizza', name: 'Pizza' });
    expect(edge.out).toMatchObject({ id: 'modifier_group:toppings', name: 'Toppings' });
    expect(edge).toMatchObject({
      has_required_modifiers: true,
      required_modifiers: 1,
      should_auto_open: true,
    });
    expect(modifier.modifier).toMatchObject({
      id: 'menu_item:cheese',
      name: 'Extra cheese',
    });
    expect(modifier.allowed_next_groups[0]).toMatchObject({
      id: 'modifier_group:nested',
      name: 'Nested',
    });
  });
});

describe('order item link reconcile', () => {
  it('drops orphan order.items refs and strips pending MERGE data.items', async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
    const { order, items } = await posStore.createOrderWithItems({
      invoiceNumber: 1,
      items: [{ dishId: 'menu_item:d1', price: 5, quantity: 1 }],
    });

    const db = (await import('@/infrastructure/pos-store/db.ts')).getPosStoreDatabase();
    const orphan = 'order_item:missing';
    await db.orders.put({
      ...((await db.orders.get(order.id))!),
      items: [...order.items, orphan],
    });

    await posStore.addItemsToOrder(order.id, [
      { dishId: 'menu_item:d1', price: 3, quantity: 1 },
    ]);

    const after = await db.orders.get(order.id);
    expect(after?.items).not.toContain(orphan);

    const pending = await posStore.getPendingOutbox();
    for (const row of pending) {
      if (row.operation?.operationType === 'MERGE_RECORD') {
        expect(row.operation.payload?.data?.items).toBeUndefined();
      }
    }

    expect(after?.items).toContain(items[0].id);
  });

  it('does not wipe items when applying a sparse MERGE projection', async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();
    const { order, items } = await posStore.createOrderWithItems({
      invoiceNumber: 2,
      items: [{ dishId: 'menu_item:d1', price: 5, quantity: 1 }],
    });
    const added = await posStore.addItemsToOrder(order.id, [
      { dishId: 'menu_item:d1', price: 4, quantity: 1 },
    ]);

    // Simulate pull of append-only MERGE event (no data.items — only timestamps).
    await posStore.applyRemoteOrderProjection({
      order: {
        id: order.id,
        updated_at: new Date().toISOString(),
        owner_heartbeat_at: new Date().toISOString(),
      },
      items: added.items,
    });

    const after = await (await import('@/infrastructure/pos-store/db.ts'))
      .getPosStoreDatabase()
      .orders.get(order.id);
    expect(after?.items).toEqual(
      expect.arrayContaining([items[0].id, added.items[0].id]),
    );
    expect(after?.owner_terminal_id).toBe(order.owner_terminal_id);
  });

  it('imports a Surreal-only split child so append can run', async () => {
    resetPosStoreDatabaseForTests();
    await posStore.initialize();

    const remoteOrder = {
      id: 'order:splitchild',
      status: 'In Progress',
      invoice_number: 99,
      covers: 1,
      floor: 'floor:f1',
      table: 'floor_table:t1',
      order_type: 'order_type:o1',
      user: 'user:u1',
      items: [
        {
          id: 'order_item:moved1',
          item: 'menu_item:d1',
          price: 10,
          quantity: 1,
          position: 0,
          level: 0,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
    };

    await posStore.ensureLocalOrder({ order: remoteOrder });
    const { order, items } = await posStore.addItemsToOrder(
      'order:splitchild',
      [{ dishId: 'menu_item:d1', price: 4, quantity: 1 }],
      { seed: { order: remoteOrder } },
    );
    expect(order.items.length).toBe(2);
    expect(items).toHaveLength(1);
  });
});
