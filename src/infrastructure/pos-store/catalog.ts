import { getPosStoreDatabase } from './db.ts';
import type { CatalogRecord, OrderItemRecord, OrderRecord } from './types.ts';

export async function upsertCatalogRecords(
  table: string,
  records: any[],
): Promise<number> {
  const db = getPosStoreDatabase();
  const rows: CatalogRecord[] = records.map((record) => {
    const id = String(record?.id ?? '');
    const key = id.includes(':') ? id : `${table}:${id}`;
    return {
      id: key,
      table,
      payload: record,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length === 0) return 0;
  await db.catalog.bulkPut(rows);
  return rows.length;
}

export async function getCatalogTable<T = any>(table: string): Promise<T[]> {
  const db = getPosStoreDatabase();
  const rows = await db.catalog.where('table').equals(table).toArray();
  return rows.map((row) => row.payload as T);
}

export async function getCatalogById<T = any>(id: string): Promise<T | undefined> {
  const db = getPosStoreDatabase();
  const row = await db.catalog.get(id);
  return row?.payload as T | undefined;
}

function byId(list: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const item of list) {
    const id = String(item?.id ?? '');
    if (id) map.set(id, item);
  }
  return map;
}

function resolveOne(value: unknown, map: Map<string, any>): any {
  if (value == null) return value;
  if (typeof value === 'object' && value !== null && 'id' in (value as object)) {
    const obj = value as { id: unknown };
    const key = String(obj.id);
    return map.get(key) ?? value;
  }
  const key = String(value);
  // Prefer joined record; fall back to a minimal { id } so callers that expect
  // FETCH-shaped refs (e.g. table.floor.id) do not crash on raw record strings.
  return map.get(key) ?? { id: key };
}

function resolveMany(values: unknown, map: Map<string, any>): any[] | unknown {
  if (!Array.isArray(values)) return values;
  return values.map((value) => resolveOne(value, map));
}

function isActive(row: any): boolean {
  if (!row) return false;
  const deleted = row.deleted_at;
  if (deleted == null || deleted === '' || deleted === 'none') return true;
  return false;
}

function sortByPriorityName(a: any, b: any): number {
  const pa = Number(a?.priority ?? 0);
  const pb = Number(b?.priority ?? 0);
  if (pa !== pb) return pa - pb;
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
}

function redactUser(user: any): any {
  if (!user) return user;
  const {
    password: _password,
    pin: _pin,
    password_hash: _passwordHash,
    ...safe
  } = user;
  return safe;
}

/**
 * Build app-settings-shaped catalogs from Dexie (JS joins — no FETCH).
 */
export async function loadHydratedCatalog(): Promise<{
  order_types: any[];
  categories: any[];
  dishes: any[];
  floors: any[];
  tables: any[];
  kitchens: any[];
  payment_types: any[];
  taxes: any[];
  menus: any[];
  modifier_groups: any[];
  groups_dishes: any[];
  workflows: any[];
  workflow_stages: any[];
  extras: any[];
  discounts: any[];
  discount_reasons: any[];
  coupons: any[];
  settings: any[];
  users: any[];
}> {
  const [
    order_typesRaw,
    categoriesRaw,
    dishesRaw,
    floorsRaw,
    tablesRaw,
    kitchensRaw,
    payment_typesRaw,
    taxesRaw,
    menus,
    menuItems,
    modifier_groups,
    modifiers,
    groups_dishes,
    workflows,
    workflow_stages,
    extrasRaw,
    discountsRaw,
    discount_reasonsRaw,
    couponsRaw,
    settingsRaw,
    usersRaw,
  ] = await Promise.all([
    getCatalogTable('order_type'),
    getCatalogTable('category'),
    getCatalogTable('menu_item'),
    getCatalogTable('floor'),
    getCatalogTable('floor_table'),
    getCatalogTable('kitchen'),
    getCatalogTable('payment_type'),
    getCatalogTable('tax'),
    getCatalogTable('menu'),
    getCatalogTable('menu_menu_item'),
    getCatalogTable('modifier_group'),
    getCatalogTable('modifier'),
    getCatalogTable('menu_item_modifier_group'),
    getCatalogTable('workflow'),
    getCatalogTable('workflow_stage'),
    getCatalogTable('extra'),
    getCatalogTable('discount'),
    getCatalogTable('discount_reason'),
    getCatalogTable('coupon'),
    getCatalogTable('setting'),
    getCatalogTable('user'),
  ]);

  const order_types = order_typesRaw.filter(isActive);
  const categories = categoriesRaw.filter(isActive);
  const dishes = dishesRaw.filter(isActive);
  const floors = floorsRaw.filter(isActive);
  const tables = tablesRaw.filter(isActive);
  const kitchens = kitchensRaw.filter(isActive);
  const taxes = taxesRaw.filter(isActive).sort(sortByPriorityName);
  const taxMap = byId(taxes);
  const payment_types = payment_typesRaw
    .filter(isActive)
    .map((pt) => ({ ...pt, tax: resolveOne(pt.tax, taxMap) }))
    .sort(sortByPriorityName);
  const extras = extrasRaw.filter(isActive);
  const discounts = discountsRaw
    .filter((row) => isActive(row) && row.is_active !== false)
    .sort(sortByPriorityName);
  const discount_reasons = discount_reasonsRaw.filter(isActive).sort(sortByPriorityName);
  const coupons = couponsRaw.filter(isActive);
  const settings = settingsRaw.filter(isActive);
  const users = usersRaw.filter(isActive).map(redactUser);

  const categoryMap = byId(categories);
  const kitchenMap = byId(kitchens);
  const floorMap = byId(floors);
  const orderTypeMap = byId(order_types);
  const paymentTypeMap = byId(payment_types);
  const stagesByWorkflow = new Map<string, any[]>();
  for (const stage of workflow_stages) {
    const wf = String(stage.workflow ?? '');
    if (!wf) continue;
    const list = stagesByWorkflow.get(wf) ?? [];
    list.push({ ...stage, kitchen: resolveOne(stage.kitchen, kitchenMap) });
    stagesByWorkflow.set(wf, list);
  }
  for (const list of stagesByWorkflow.values()) {
    list.sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0));
  }
  const workflowMap = byId(
    workflows.map((wf) => ({
      ...wf,
      stages: stagesByWorkflow.get(String(wf.id)) ?? [],
    })),
  );

  const hydratedDishes = dishes.map((dish) => ({
    ...dish,
    categories: resolveMany(dish.categories, categoryMap),
    tax: resolveOne(dish.tax, taxMap),
    taxes: resolveMany(dish.taxes, taxMap),
    workflow: resolveOne(dish.workflow, workflowMap),
  }));

  const dishHydratedMap = byId(hydratedDishes);
  const menuItemMap = byId(menuItems);
  const hydratedMenus = menus.map((menu) => ({
    ...menu,
    items: (Array.isArray(menu.items) ? menu.items : [])
      .map((ref: unknown) => resolveOne(ref, menuItemMap))
      .map((item: any) => ({
        ...item,
        menu_item: resolveOne(item?.menu_item, dishHydratedMap),
        taxes: resolveMany(item?.taxes ?? [], taxMap),
        tax: resolveOne(item?.tax, taxMap),
      }))
      .filter((item: any) => item?.menu_item),
  }));

  const groupReferenceMap = byId(modifier_groups);
  const hydratedModifiers = modifiers.map((modifier) => ({
    ...modifier,
    modifier: resolveOne(modifier.modifier, dishHydratedMap),
    allowed_next_groups: resolveMany(modifier.allowed_next_groups, groupReferenceMap),
  }));
  const modifierMap = byId(hydratedModifiers);
  const hydratedGroups = modifier_groups
    .map((group) => ({
      ...group,
      modifiers: resolveMany(group.modifiers, modifierMap),
    }))
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));
  const hydratedGroupMap = byId(hydratedGroups);
  const hydratedGroupsDishes = groups_dishes
    .map((edge) => ({
      ...edge,
      in: resolveOne(edge.in, dishHydratedMap),
      out: resolveOne(edge.out, hydratedGroupMap),
    }))
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));

  const hydratedTables = tables.map((table) => ({
    ...table,
    floor: resolveOne(table.floor, floorMap),
    categories: resolveMany(table.categories, categoryMap),
    order_types: resolveMany(table.order_types, orderTypeMap),
    payment_types: resolveMany(table.payment_types, paymentTypeMap),
  }));
  const hydratedTableMap = byId(hydratedTables);

  const hydratedExtras = extras
    .map((extra) => ({
      ...extra,
      payment_types: resolveMany(extra.payment_types, paymentTypeMap),
      order_types: resolveMany(extra.order_types, orderTypeMap),
      tables: resolveMany(extra.tables, hydratedTableMap),
    }))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));

  return {
    order_types,
    categories,
    dishes: hydratedDishes,
    floors,
    tables: hydratedTables,
    kitchens,
    payment_types,
    taxes,
    menus: hydratedMenus,
    modifier_groups: hydratedGroups,
    groups_dishes: hydratedGroupsDishes,
    workflows: [...workflowMap.values()],
    workflow_stages,
    extras: hydratedExtras,
    discounts,
    discount_reasons,
    coupons,
    settings,
    users,
  };
}

export type HydratedCatalog = Awaited<ReturnType<typeof loadHydratedCatalog>>;

export async function getActivePaymentTypes(): Promise<any[]> {
  const { payment_types } = await loadHydratedCatalog();
  return payment_types;
}

export async function getPaymentTypesForTable(tableId: string | null | undefined): Promise<any[]> {
  const catalog = await loadHydratedCatalog();
  if (tableId) {
    const key = String(tableId);
    const table = catalog.tables.find((row) => String(row.id) === key);
    const restricted = Array.isArray(table?.payment_types) ? table.payment_types : [];
    if (restricted.length > 0) return restricted;
  }
  return catalog.payment_types;
}

export async function getActiveTaxes(): Promise<any[]> {
  const { taxes } = await loadHydratedCatalog();
  return taxes;
}

export type ExtraApplicabilityContext = {
  paymentTypeIds?: Iterable<string>;
  orderTypeId?: string | null;
  tableId?: string | null;
  isDelivery?: boolean;
};

export function isExtraApplicable(
  extra: any,
  context: ExtraApplicabilityContext,
): boolean {
  if (extra?.apply_to_all) return true;

  const hasPaymentTypeRule = (extra?.payment_types?.length || 0) > 0;
  const hasOrderTypeRule = (extra?.order_types?.length || 0) > 0;
  const hasTableRule = (extra?.tables?.length || 0) > 0;
  const hasDeliveryRule = !!extra?.delivery;
  const hasAnyRule = hasPaymentTypeRule || hasOrderTypeRule || hasTableRule || hasDeliveryRule;
  if (!hasAnyRule) return false;
  if (hasDeliveryRule && !context.isDelivery) return false;

  if (hasOrderTypeRule) {
    const orderTypeIds = new Set(
      (extra.order_types ?? []).map((item: any) => String(item?.id ?? item)),
    );
    if (!context.orderTypeId || !orderTypeIds.has(String(context.orderTypeId))) {
      return false;
    }
  }

  if (hasTableRule) {
    const tableIds = new Set((extra.tables ?? []).map((item: any) => String(item?.id ?? item)));
    if (!context.tableId || !tableIds.has(String(context.tableId))) {
      return false;
    }
  }

  if (hasPaymentTypeRule) {
    const extraPaymentTypeIds = new Set(
      (extra.payment_types ?? []).map((item: any) => String(item?.id ?? item)),
    );
    const selected = [...(context.paymentTypeIds ?? [])];
    if (!selected.some((id) => extraPaymentTypeIds.has(String(id)))) {
      return false;
    }
  }

  return true;
}

export async function getApplicableExtras(context: ExtraApplicabilityContext): Promise<any[]> {
  const { extras } = await loadHydratedCatalog();
  return extras.filter((extra) => isExtraApplicable(extra, context));
}

export async function getActiveDiscountRules(): Promise<any[]> {
  const { discounts } = await loadHydratedCatalog();
  return discounts;
}

export async function getActiveDiscountReasons(): Promise<any[]> {
  const { discount_reasons } = await loadHydratedCatalog();
  return discount_reasons;
}

export async function findActiveCouponByCode(code: string): Promise<any | null> {
  const needle = String(code ?? '').trim().toLowerCase();
  if (!needle) return null;
  const { coupons } = await loadHydratedCatalog();
  return (
    coupons.find((coupon) => {
      if (String(coupon.code ?? '').trim().toLowerCase() !== needle) return false;
      if (coupon.is_active === false) return false;
      return true;
    }) ?? null
  );
}

export async function getGlobalSetting(key: string): Promise<any | undefined> {
  const { settings } = await loadHydratedCatalog();
  return settings.find(
    (row) => String(row.key) === key && (row.is_global === true || row.is_global == null),
  );
}

export async function getUserSettingOrGlobal(
  key: string,
  userId?: string | null,
): Promise<any | undefined> {
  const { settings } = await loadHydratedCatalog();
  if (userId) {
    const userSetting = settings.find(
      (row) =>
        String(row.key) === key &&
        !row.is_global &&
        String(row.user ?? row.user_id ?? '') === String(userId),
    );
    if (userSetting) return userSetting;
  }
  return getGlobalSetting(key);
}

export async function countCouponRedemptions(options: {
  couponId: string;
  userId?: string | null;
}): Promise<{ global: number; perUser: number }> {
  const db = getPosStoreDatabase();
  const couponKey = String(options.couponId);
  const rows = await db.couponRedemptions.where('coupon').equals(couponKey).toArray();
  const perUser = options.userId
    ? rows.filter((row) => String(row.user ?? '') === String(options.userId)).length
    : 0;
  return { global: rows.length, perUser };
}

export async function searchCustomers(query: string, limit = 20): Promise<any[]> {
  const db = getPosStoreDatabase();
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];
  const rows = await db.customers.toArray();
  return rows
    .filter((row) => {
      const hay = `${row.name ?? ''} ${row.phone ?? ''} ${row.email ?? ''}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, limit);
}

export async function getOpenOrders(): Promise<OrderRecord[]> {
  // Full reconcile is reserved for sync — not every UI open-order refresh.
  const db = getPosStoreDatabase();
  return db.orders.where('status').equals('In Progress').sortBy('created_at');
}

/**
 * Drop `order.items` links that have no matching `orderItems` row in Dexie, and
 * strip pending outbox `data.items` arrays so a repaired SurrealDB cannot be
 * re-poisoned by a stale local items list on the next MERGE push.
 */
export async function reconcileOrderItemLinks(orderId?: string): Promise<number> {
  const db = getPosStoreDatabase();
  let pruned = 0;

  await db.transaction(
    'rw',
    [db.orders, db.orderItems, db.domainOperations, db.syncOutbox],
    async () => {
      const orders = orderId
        ? ([await db.orders.get(orderId)].filter(Boolean) as OrderRecord[])
        : await db.orders.toArray();

      for (const order of orders) {
        const refs = (order.items ?? []).map(String);
        if (refs.length === 0) continue;
        const existing = new Set<string>();
        const byId = await db.orderItems.bulkGet(refs);
        for (const row of byId) {
          if (row) existing.add(String(row.id));
        }
        const byOrder = await db.orderItems.where('order').equals(String(order.id)).toArray();
        for (const row of byOrder) existing.add(String(row.id));

        const nextItems = refs.filter((id) => existing.has(id));
        if (nextItems.length !== refs.length) {
          pruned += refs.length - nextItems.length;
          await db.orders.put({ ...order, items: nextItems });
        }
      }

      const pending = await db.syncOutbox
        .where('status')
        .anyOf(['pending', 'failed', 'conflict'])
        .toArray();
      for (const row of pending) {
        const op = await db.domainOperations.get(row.operationId);
        if (!op?.payload?.data || !Array.isArray(op.payload.data.items)) continue;
        if (op.operationType !== 'MERGE_RECORD' && op.operationType !== 'CREATE_RECORD') {
          continue;
        }
        // Gateway appends from payload.items children; data.items must not replace.
        const nextPayload = {
          ...op.payload,
          data: { ...op.payload.data },
        };
        delete nextPayload.data.items;
        await db.domainOperations.put({ ...op, payload: nextPayload });
      }
    },
  );

  return pruned;
}

/**
 * Order shaped like the legacy `SELECT ... FETCH items, items.item, items.taxes,
 * order_type, table, user, tax` query, but joined from Dexie. Floor, payment and
 * order screens only understand this FETCH shape; raw `OrderRecord` rows carry
 * string links that make them render "()" names, zero totals, and crash on
 * `item.item.name`.
 */
export type HydratedOrder = Omit<
  OrderRecord,
  | 'items' | 'user' | 'table' | 'floor' | 'order_type' | 'tax' | 'customer' | 'cashier'
  | 'discount' | 'payments' | 'order_taxes' | 'order_discounts' | 'extras' | 'coupon'
> & {
  items: any[];
  user: any;
  cashier: any;
  table: any;
  floor: any;
  order_type: any;
  tax: any;
  customer: any;
  discount: any;
  order_taxes: any[];
  order_discounts: any[];
  extras: any[];
  payments: any[];
  coupon: any;
};

function sortOrderItems(items: OrderItemRecord[]): OrderItemRecord[] {
  return [...items].sort((a, b) => {
    const byPosition = Number(a.position ?? 0) - Number(b.position ?? 0);
    if (byPosition !== 0) return byPosition;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });
}

function groupByOrder<T extends { order?: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(row.order ?? '');
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

/** Resolve `order.<relation>` ids against local child rows; drop unknown ids. */
function joinRelation(ids: unknown, rowsForOrder: any[], enrich: (row: any) => any): any[] {
  const byRowId = new Map(rowsForOrder.map((row) => [String(row.id), row]));
  const ordered: any[] = [];
  const seen = new Set<string>();
  if (Array.isArray(ids)) {
    for (const ref of ids) {
      const key = String(typeof ref === 'object' && ref ? (ref as any).id : ref);
      const row = byRowId.get(key);
      if (row && !seen.has(key)) {
        seen.add(key);
        ordered.push(enrich(row));
      }
    }
  }
  // Rows that exist locally but are not linked yet (e.g. pull raced the link).
  for (const row of rowsForOrder) {
    const key = String(row.id);
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(enrich(row));
    }
  }
  return ordered;
}

export async function hydrateOrders(orders: OrderRecord[]): Promise<HydratedOrder[]> {
  if (orders.length === 0) return [];
  const db = getPosStoreDatabase();
  const orderIds = orders.map((order) => String(order.id));

  const [
    itemRows,
    users,
    taxes,
    categories,
    floors,
    tables,
    orderTypes,
    dishes,
    paymentTypes,
    discounts,
    coupons,
    paymentRows,
    taxRows,
    discountRows,
    extraRows,
    couponRows,
    customerRows,
  ] = await Promise.all([
    db.orderItems.where('order').anyOf(orderIds).toArray(),
    getCatalogTable('user'),
    getCatalogTable('tax'),
    getCatalogTable('category'),
    getCatalogTable('floor'),
    getCatalogTable('floor_table'),
    getCatalogTable('order_type'),
    getCatalogTable('menu_item'),
    getCatalogTable('payment_type'),
    getCatalogTable('discount'),
    getCatalogTable('coupon'),
    db.orderPayments.where('order').anyOf(orderIds).toArray(),
    db.orderTaxes.where('order').anyOf(orderIds).toArray(),
    db.orderDiscounts.where('order').anyOf(orderIds).toArray(),
    db.orderExtras.where('order').anyOf(orderIds).toArray(),
    db.orderCoupons.where('order').anyOf(orderIds).toArray(),
    db.customers.bulkGet(
      [...new Set(orders.map((order) => order.customer).filter(Boolean) as string[])],
    ),
  ]);

  const userMap = byId(users);
  const taxMap = byId(taxes);
  const categoryMap = byId(categories);
  const floorMap = byId(floors);
  const orderTypeMap = byId(orderTypes);
  const paymentTypeMap = byId(paymentTypes);
  const discountMap = byId(discounts);
  const couponMap = byId(coupons);
  const customerMap = byId(customerRows.filter(Boolean));
  const paymentsByOrder = groupByOrder(paymentRows);
  const taxesByOrder = groupByOrder(taxRows);
  const discountsByOrder = groupByOrder(discountRows);
  const extrasByOrder = groupByOrder(extraRows);
  const couponsByOrder = groupByOrder(couponRows);
  const dishMap = byId(
    dishes.map((dish) => ({
      ...dish,
      categories: resolveMany(dish.categories, categoryMap),
      tax: resolveOne(dish.tax, taxMap),
      taxes: resolveMany(dish.taxes, taxMap),
    })),
  );
  const tableMap = byId(
    tables.map((table) => ({ ...table, floor: resolveOne(table.floor, floorMap) })),
  );

  const itemsByOrder = new Map<string, OrderItemRecord[]>();
  for (const row of itemRows) {
    const key = String(row.order ?? '');
    const list = itemsByOrder.get(key) ?? [];
    list.push(row);
    itemsByOrder.set(key, list);
  }

  return orders.map((order) => {
    const orderId = String(order.id);
    const known = itemsByOrder.get(orderId) ?? [];
    // Never invent stubs for missing links — orphans crash the Orders UI and
    // used to be re-pushed into Surreal via MERGE of the full items array.
    const items = sortOrderItems(known).map((row) => ({
      ...row,
      item: resolveOne(row.item, dishMap),
      taxes: resolveMany(row.taxes ?? [], taxMap),
      // Cart matches `item.seat === state.seat`; "no seat" is `undefined`, never `null`.
      seat: row.seat ?? undefined,
      // Cart treats `deleted_at === undefined` as "live line".
      deleted_at: row.deleted_at ?? undefined,
    }));

    const localCoupons = couponsByOrder.get(orderId) ?? [];
    const couponRow = order.coupon
      ? localCoupons.find((row) => String(row.id) === String(order.coupon)) ?? localCoupons[0]
      : localCoupons[0];

    return {
      ...order,
      items,
      user: resolveOne(order.user, userMap),
      cashier: order.cashier ? resolveOne(order.cashier, userMap) : order.cashier ?? null,
      table: resolveOne(order.table, tableMap),
      floor: resolveOne(order.floor, floorMap),
      order_type: resolveOne(order.order_type, orderTypeMap),
      tax: resolveOne(order.tax ?? null, taxMap),
      customer: order.customer ? resolveOne(order.customer, customerMap) : null,
      discount: order.discount ? resolveOne(order.discount, discountMap) : order.discount ?? null,
      // Child relations join from Dexie; when a row is missing locally the
      // array stays short and Surreal FETCH (if any) fills it in the merge.
      payments: joinRelation(order.payments, paymentsByOrder.get(orderId) ?? [], (row) => ({
        ...row,
        payment_type: resolveOne(row.payment_type, paymentTypeMap),
      })),
      order_taxes: joinRelation(order.order_taxes, taxesByOrder.get(orderId) ?? [], (row) => ({
        ...row,
        tax: resolveOne(row.tax, taxMap),
      })),
      order_discounts: joinRelation(
        order.order_discounts,
        discountsByOrder.get(orderId) ?? [],
        (row) => ({ ...row, discount: resolveOne(row.discount, discountMap) }),
      ),
      extras: joinRelation(order.extras, extrasByOrder.get(orderId) ?? [], (row) => row),
      coupon: couponRow
        ? { ...couponRow, coupon: resolveOne(couponRow.coupon, couponMap) }
        : null,
    };
  });
}

/**
 * Tax recompute only needs live lines + tax records — not the full catalog join
 * used by floor/payment FETCH hydration.
 */
export async function hydrateOrderForTaxRecompute(order: OrderRecord): Promise<HydratedOrder> {
  const db = getPosStoreDatabase();
  const orderId = String(order.id);
  const itemRows = await db.orderItems.where('order').equals(orderId).toArray();
  const taxIds = new Set<string>();
  const orderTaxId = order.tax ? String(order.tax) : null;
  if (orderTaxId) taxIds.add(orderTaxId);
  for (const row of itemRows) {
    for (const tax of row.taxes ?? []) {
      const id = typeof tax === 'string' ? tax : (tax as any)?.id;
      if (id) taxIds.add(String(id));
    }
  }
  const taxRows = (
    await Promise.all([...taxIds].map((id) => getCatalogById(id)))
  ).filter(Boolean);
  const taxMap = byId(taxRows);
  const items = sortOrderItems(itemRows).map((row) => ({
    ...row,
    taxes: resolveMany(row.taxes ?? [], taxMap),
    seat: row.seat ?? undefined,
    deleted_at: row.deleted_at ?? undefined,
  }));
  return {
    ...order,
    items,
    tax: orderTaxId ? resolveOne(orderTaxId, taxMap) : null,
  } as HydratedOrder;
}

/**
 * KDS rows for one kitchen in the legacy `SELECT * FROM order_item_kitchen …
 * FETCH order_item, order_item.item, order_item.order, order_item.order.table,
 * order_item.order.user, order_item.order.order_type` shape, joined from Dexie.
 */
export async function getKitchenRowsHydrated(
  kitchenId: string,
  options?: { sinceIso?: string },
): Promise<any[]> {
  const db = getPosStoreDatabase();
  const kitchenKey = kitchenId.includes(':') ? kitchenId : `kitchen:${kitchenId}`;
  let rows = await db.orderItemKitchens.where('kitchen').equals(kitchenKey).toArray();
  if (options?.sinceIso) {
    const since = new Date(options.sinceIso).getTime();
    rows = rows.filter((row) => new Date(String(row.created_at)).getTime() >= since);
  }
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((row) => String(row.order_item)))];
  const items = (await db.orderItems.bulkGet(itemIds)).filter(
    (row): row is OrderItemRecord => !!row,
  );
  const orderIds = [...new Set(items.map((item) => String(item.order)))];
  const [orders, dishes, users, tables, floors, orderTypes] = await Promise.all([
    db.orders.bulkGet(orderIds),
    getCatalogTable('menu_item'),
    getCatalogTable('user'),
    getCatalogTable('floor_table'),
    getCatalogTable('floor'),
    getCatalogTable('order_type'),
  ]);
  const dishMap = byId(dishes);
  const userMap = byId(users);
  const floorMap = byId(floors);
  const tableMap = byId(tables.map((table) => ({ ...table, floor: resolveOne(table.floor, floorMap) })));
  const orderTypeMap = byId(orderTypes);
  const orderMap = byId(
    orders
      .filter((order): order is OrderRecord => !!order)
      .map((order) => ({
        ...order,
        table: resolveOne(order.table, tableMap),
        user: resolveOne(order.user, userMap),
        order_type: resolveOne(order.order_type, orderTypeMap),
      })),
  );
  const itemMap = byId(
    items.map((item) => ({
      ...item,
      item: resolveOne(item.item, dishMap),
      order: resolveOne(item.order, orderMap),
      deleted_at: item.deleted_at ?? undefined,
    })),
  );

  return rows
    .map((row) => ({
      ...row,
      order_item: itemMap.get(String(row.order_item)) ?? null,
    }))
    .filter((row) => row.order_item);
}

/** Child rows for one order across every mirrored table (for settle/void/refund). */
export async function getOrderChildren(orderId: string): Promise<{
  payments: any[];
  taxes: any[];
  discounts: any[];
  extras: any[];
  coupons: any[];
  voids: any[];
  refunds: any[];
}> {
  const db = getPosStoreDatabase();
  const [payments, taxes, discounts, extras, coupons, voids, refunds] = await Promise.all([
    db.orderPayments.where('order').equals(orderId).toArray(),
    db.orderTaxes.where('order').equals(orderId).toArray(),
    db.orderDiscounts.where('order').equals(orderId).toArray(),
    db.orderExtras.where('order').equals(orderId).toArray(),
    db.orderCoupons.where('order').equals(orderId).toArray(),
    db.orderVoids.where('order').equals(orderId).toArray(),
    db.orderRefunds.where('order').equals(orderId).toArray(),
  ]);
  return { payments, taxes, discounts, extras, coupons, voids, refunds };
}

export async function getOpenOrdersHydrated(): Promise<HydratedOrder[]> {
  return hydrateOrders(await getOpenOrders());
}

function isTablelessOrder(order: OrderRecord): boolean {
  const table = order.table;
  if (table == null || table === '') return true;
  const raw = String(table);
  return raw === 'none' || raw === 'NONE';
}

function hasDeliveryPayload(order: OrderRecord): boolean {
  const delivery = (order as any).delivery;
  if (delivery == null || delivery === 'NONE' || delivery === 'none') return false;
  if (Array.isArray(delivery)) return delivery.length > 0;
  if (typeof delivery === 'object') return Object.keys(delivery).length > 0;
  return Boolean(delivery);
}

/** Open tableless checks (counter / quick-service sidebar). */
export async function getOpenTablelessOrdersHydrated(): Promise<HydratedOrder[]> {
  await reconcileOrderItemLinks();
  const db = getPosStoreDatabase();
  const rows = await db.orders
    .where('status')
    .equals('In Progress')
    .filter((order) => !order.deleted_at && isTablelessOrder(order))
    .sortBy('created_at');
  return hydrateOrders(rows);
}

/** Open + pending delivery tickets for the delivery board / auto-popup. */
export async function getDeliveryOrdersHydrated(
  statuses: string[] = ['In Progress', 'Pending'],
): Promise<HydratedOrder[]> {
  await reconcileOrderItemLinks();
  const db = getPosStoreDatabase();
  const statusSet = new Set(statuses);
  const rows = await db.orders
    .filter(
      (order) =>
        !order.deleted_at &&
        statusSet.has(String(order.status)) &&
        hasDeliveryPayload(order),
    )
    .toArray();
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return hydrateOrders(rows);
}

/**
 * All kitchen stage rows created since `sinceIso` (order-display board), with
 * `order_item` joined. Suspended lines are dropped to match the legacy query.
 */
export async function getKitchenRowsSince(sinceIso: string): Promise<any[]> {
  const db = getPosStoreDatabase();
  const since = new Date(sinceIso).getTime();
  const rows = await db.orderItemKitchens
    .filter((row) => new Date(String(row.created_at)).getTime() >= since)
    .toArray();
  if (rows.length === 0) return [];

  const itemIds = [...new Set(rows.map((row) => String(row.order_item)))];
  const items = (await db.orderItems.bulkGet(itemIds)).filter(
    (row): row is OrderItemRecord => !!row && !row.is_suspended,
  );
  const itemMap = byId(items);
  return rows
    .map((row) => ({
      ...row,
      order_item: itemMap.get(String(row.order_item)) ?? null,
    }))
    .filter((row) => row.order_item);
}

/** Kitchens with dish + printer assignments for the KDS station picker. */
export async function getKitchensHydrated(): Promise<any[]> {
  const [kitchens, printers, dishes] = await Promise.all([
    getCatalogTable('kitchen'),
    getCatalogTable('printer'),
    getCatalogTable('menu_item'),
  ]);
  const printerMap = byId(printers.filter(isActive));
  const dishMap = byId(dishes.filter(isActive));
  return kitchens
    .filter(isActive)
    .map((kitchen) => ({
      ...kitchen,
      items: resolveMany(kitchen.items, dishMap),
      printers: resolveMany(kitchen.printers, printerMap),
    }))
    .sort(sortByPriorityName);
}

/**
 * One kitchen stage row hydrated for KOT print (order_item + order + kitchen + printers).
 */
export async function getKitchenRowHydratedForPrint(kitchenRowId: string): Promise<any | null> {
  const db = getPosStoreDatabase();
  const key = kitchenRowId.includes(':') ? kitchenRowId : `order_item_kitchen:${kitchenRowId}`;
  const row = await db.orderItemKitchens.get(key);
  if (!row) return null;

  const item = await db.orderItems.get(String(row.order_item));
  if (!item) return null;
  const orderRow = await db.orders.get(String(item.order));
  if (!orderRow) return null;
  const [order, kitchens] = await Promise.all([
    hydrateOrders([orderRow]).then((rows) => rows[0]),
    getKitchensHydrated(),
  ]);
  if (!order) return null;

  const dish = await getCatalogById(String(item.item));
  const kitchen =
    kitchens.find((k) => String(k.id) === String(row.kitchen)) ??
    (await getCatalogById(String(row.kitchen)));

  return {
    ...row,
    kitchen,
    order_item: {
      ...item,
      item: dish,
      order,
    },
  };
}

/**
 * Every open order plus closed orders created since `sinceIso` (the Orders
 * screen history for the selected day). Dexie only holds recent operational
 * rows; older history is served by SurrealDB when reachable.
 */
export async function getRecentOrdersHydrated(options: {
  sinceIso: string;
  untilIso?: string;
}): Promise<HydratedOrder[]> {
  await reconcileOrderItemLinks();
  const db = getPosStoreDatabase();
  const since = new Date(options.sinceIso).getTime();
  const until = options.untilIso ? new Date(options.untilIso).getTime() : Number.POSITIVE_INFINITY;
  const rows = await db.orders
    .filter((order) => {
      if (order.deleted_at) return false;
      if (order.status === 'In Progress') return true;
      const createdAt = new Date(String(order.created_at)).getTime();
      return createdAt >= since && createdAt < until;
    })
    .toArray();
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return hydrateOrders(rows);
}

export async function getOrderWithItems(orderId: string): Promise<{
  order: OrderRecord;
  items: OrderItemRecord[];
} | null> {
  await reconcileOrderItemLinks(orderId);
  const db = getPosStoreDatabase();
  const order = await db.orders.get(orderId);
  if (!order) return null;
  const items = await db.orderItems.where('order').equals(orderId).toArray();
  return { order, items };
}

const ORDER_RELATION_ARRAYS = ['payments', 'order_taxes', 'order_discounts', 'extras'] as const;
const ORDER_RELATION_LINKS = ['coupon', 'customer', 'discount', 'cashier', 'discount_manager'] as const;

function relationId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object' && 'id' in (value as object)) {
    return relationId((value as { id: unknown }).id);
  }
  const raw = String(value);
  return raw && raw !== '[object Object]' ? raw : null;
}

export async function applyRemoteOrderProjection(payload: {
  order?: Partial<OrderRecord> & { id?: string };
  items?: OrderItemRecord[];
  /** Accepted for call-site clarity; relations are always kept as id strings. */
  keepRelations?: boolean;
}): Promise<void> {
  const db = getPosStoreDatabase();
  await db.transaction('rw', db.orders, db.orderItems, async () => {
    if (payload.order) {
      const id = String(payload.order.id ?? '');
      if (!id) return;
      const existing = await db.orders.get(id);
      const patch = { ...payload.order } as OrderRecord;
      // MERGE events often omit `items` (append-only sync). Never clobber the
      // local items array with [] — union in children from this event instead.
      const patchHasItems = Array.isArray(payload.order.items);
      let nextItems = patchHasItems
        ? payload.order.items!.map(String)
        : (existing?.items ?? []).map(String);
      if (payload.items?.length) {
        const seen = new Set(nextItems);
        for (const row of payload.items) {
          const rowId = String(row.id);
          if (!seen.has(rowId)) {
            seen.add(rowId);
            nextItems.push(rowId);
          }
        }
      }
      const next: OrderRecord = {
        ...(existing ?? {
          id,
          status: 'In Progress',
          items: [],
          created_at: new Date().toISOString(),
          owner_terminal_id: '',
          owner_heartbeat_at: new Date().toISOString(),
          server_version: 1,
        }),
        ...patch,
        id,
        items: nextItems,
      };
      // Relations are stored as plain record-id strings; hydrateOrders joins
      // them against the local child stores (payments, taxes, …).
      for (const key of ORDER_RELATION_ARRAYS) {
        if (!(key in patch)) continue;
        const value = (patch as any)[key];
        (next as any)[key] = Array.isArray(value)
          ? value.map(relationId).filter(Boolean)
          : existing?.[key] ?? [];
      }
      for (const key of ORDER_RELATION_LINKS) {
        if (!(key in patch)) continue;
        (next as any)[key] = relationId((patch as any)[key]);
      }
      // Don't let sparse MERGE patches blank required ownership fields.
      if (!payload.order.owner_terminal_id && existing?.owner_terminal_id) {
        next.owner_terminal_id = existing.owner_terminal_id;
      }
      if (!payload.order.owner_heartbeat_at && existing?.owner_heartbeat_at) {
        next.owner_heartbeat_at = existing.owner_heartbeat_at;
      }
      if (!payload.order.created_at && existing?.created_at) {
        next.created_at = existing.created_at;
      }
      if (payload.order.server_version == null && existing?.server_version != null) {
        next.server_version = existing.server_version;
      }
      await db.orders.put(next);
    }
    if (payload.items?.length) await db.orderItems.bulkPut(payload.items);
  });
}

