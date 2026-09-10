import { getPosStoreDatabase } from './db.ts';
import { ensureTerminalIdentity, nextOperationIdentity, recordId } from './identity.ts';
import { assertCashierOwner, canStealOrder } from './ownership.ts';
import { isPosStoreEffectivelyConnected } from './connectivity.ts';
import { reconcileOrderItemLinks } from './catalog.ts';
import {
  POS_SCHEMA_VERSION,
  POS_SYNC_PROTOCOL_VERSION,
  PosStoreError,
  type CreateOrderInput,
  type CreateOrderItemInput,
  type CustomerRecord,
  type DomainOperation,
  type NumberSeries,
  type TableLockRecord,
  type OrderItemKitchenRecord,
  type OrderItemRecord,
  type OrderPrintRecord,
  type OrderRecord,
  type SyncOutboxRow,
} from './types.ts';

export function notifyWrite(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('posr-posstore-write'));
    window.dispatchEvent(new CustomEvent('posr-operational-orders-updated'));
  }
}

export function nowIso(value?: string | Date): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function refId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: unknown }).id ?? '') || null;
  }
  const raw = String(value);
  return raw && raw !== 'undefined' ? raw : null;
}

function toLocalOrderItem(orderId: string, row: any, index: number): OrderItemRecord | null {
  if (row == null) return null;
  if (typeof row !== 'object') {
    // Bare record id — cannot build a cashier line without the row body.
    return null;
  }
  const id = refId(row.id) ?? refId(row);
  if (!id) return null;
  const dishId = refId(row.item) ?? (typeof row.item === 'string' ? row.item : null);
  return {
    id: id.includes(':') ? id : `order_item:${id}`,
    order: orderId,
    item: dishId ?? 'menu_item:unknown',
    price: Number(row.price ?? 0),
    quantity: Number(row.quantity ?? 1),
    comments: row.comments,
    modifiers: row.modifiers ?? [],
    tax: Number(row.tax ?? 0),
    taxes: Array.isArray(row.taxes)
      ? row.taxes.map((tax: unknown) => refId(tax)).filter(Boolean) as string[]
      : [],
    tax_mode: row.tax_mode,
    seat: row.seat != null ? String(row.seat) : undefined,
    is_suspended: !!row.is_suspended,
    is_addition: !!row.is_addition,
    position: Number(row.position ?? index),
    level: Number(row.level ?? 0),
    category: row.category,
    category_id: refId(row.category_id),
    menu: row.menu,
    created_at: row.created_at ? nowIso(row.created_at) : nowIso(),
    created_by: refId(row.created_by),
    deleted_at: row.deleted_at ? nowIso(row.deleted_at) : undefined,
    original_price: row.original_price,
    service_charges: row.service_charges ?? 0,
    discount: row.discount ?? 0,
  };
}

/**
 * Import a Surreal-only order (e.g. split child) into Dexie so cashier
 * mutations can run. Does not enqueue CREATE — the row already exists on the server.
 */
export async function ensureLocalOrder(source: {
  order: any;
  items?: any[];
}): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const orderId = refId(source.order?.id) ?? refId(source.order);
  if (!orderId) {
    throw new PosStoreError('NOT_FOUND', 'Cannot import order without an id');
  }
  const key = orderId.includes(':') ? orderId : `order:${orderId}`;

  const existing = await db.orders.get(key);
  if (existing) return existing;

  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.order?.items)
      ? source.order.items
      : [];
  const itemRows: OrderItemRecord[] = [];
  const itemIds: string[] = [];
  rawItems.forEach((row: any, index: number) => {
    const local = toLocalOrderItem(key, row, index);
    if (!local) {
      const bare = refId(row);
      if (bare) itemIds.push(bare.includes(':') ? bare : `order_item:${bare}`);
      return;
    }
    itemRows.push(local);
    itemIds.push(local.id);
  });

  const createdAt = source.order?.created_at
    ? nowIso(source.order.created_at)
    : nowIso();
  const local: OrderRecord = {
    id: key,
    status: String(source.order?.status ?? 'In Progress'),
    invoice_number: source.order?.invoice_number,
    auto_id: source.order?.auto_id,
    covers: source.order?.covers ?? 1,
    floor: refId(source.order?.floor),
    table: refId(source.order?.table),
    order_type: refId(source.order?.order_type),
    customer: refId(source.order?.customer),
    user: refId(source.order?.user),
    items: itemIds.length ? itemIds : (Array.isArray(source.order?.items)
      ? source.order.items.map((entry: unknown) => refId(entry)).filter(Boolean) as string[]
      : []),
    tags: Array.isArray(source.order?.tags) ? source.order.tags : ['Normal'],
    service_charge: Number(source.order?.service_charge ?? 0),
    service_charge_amount: Number(source.order?.service_charge_amount ?? 0),
    service_charge_type: source.order?.service_charge_type ?? 'Percent',
    tax_amount: Number(source.order?.tax_amount ?? 0),
    discount_amount: Number(source.order?.discount_amount ?? 0),
    tip: source.order?.tip,
    tip_amount: source.order?.tip_amount,
    tip_type: source.order?.tip_type,
    notes: source.order?.notes,
    split: source.order?.split,
    created_at: createdAt,
    updated_at: source.order?.updated_at ? nowIso(source.order.updated_at) : createdAt,
    deleted_at: source.order?.deleted_at ? nowIso(source.order.deleted_at) : null,
    owner_terminal_id: String(source.order?.owner_terminal_id || identity.terminalId),
    owner_heartbeat_at: nowIso(),
    server_version: Number(source.order?.server_version ?? 1),
  };

  await db.transaction('rw', [db.orders, db.orderItems], async () => {
    await db.orders.put(local);
    if (itemRows.length) await db.orderItems.bulkPut(itemRows);
  });
  notifyWrite();
  return local;
}

/**
 * Build schema-shaped `order_item` + `order_item_kitchen` rows for one cart line.
 * Shapes mirror the SCHEMAFULL Surreal definitions so the gateway only needs to
 * coerce record links: `position`/`level` are required ints, `seat` is a string,
 * and the kitchen stage link is `stage` (not `workflow_stage`).
 */
export function buildOrderItemRows(
  orderId: string,
  line: CreateOrderItemInput,
  position: number,
  createdAt: string,
  isAddition: boolean,
): { item: OrderItemRecord; kitchens: OrderItemKitchenRecord[] } {
  const itemId = recordId('order_item', line.id);
  const item: OrderItemRecord = {
    id: itemId,
    order: orderId,
    item: line.dishId.includes(':') ? line.dishId : `menu_item:${line.dishId}`,
    price: line.price,
    ...(line.originalPrice !== undefined ? { original_price: line.originalPrice } : {}),
    quantity: line.quantity,
    comments: line.comments,
    modifiers: line.modifiers ?? [],
    service_charges: line.serviceCharges ?? 0,
    discount: line.discount ?? 0,
    tax: line.tax ?? 0,
    taxes: line.taxes ?? [],
    tax_mode: line.taxMode,
    seat: line.seat != null ? String(line.seat) : undefined,
    is_suspended: !!line.isHold,
    is_addition: isAddition,
    position,
    level: line.level ?? 0,
    category: line.category,
    category_id: line.categoryId ?? null,
    menu: line.menuName,
    created_at: createdAt,
    created_by: line.createdBy ?? null,
  };

  const kitchens: OrderItemKitchenRecord[] = (line.kitchenStages ?? []).map((stage) => ({
    id: recordId('order_item_kitchen'),
    kitchen: stage.kitchenId.includes(':') ? stage.kitchenId : `kitchen:${stage.kitchenId}`,
    order_item: itemId,
    status: stage.status,
    sequence: stage.sequence,
    is_terminal: stage.isTerminal,
    workflow: stage.workflowId ?? null,
    stage: stage.stageId ?? null,
    stage_name: stage.stageName ?? null,
    created_at: createdAt,
    activated_at: stage.status === 'pending' ? createdAt : null,
  }));

  return { item, kitchens };
}

async function appendOperation(
  operation: DomainOperation,
): Promise<void> {
  const db = getPosStoreDatabase();
  const outbox: SyncOutboxRow = {
    operationId: operation.operationId,
    status: 'pending',
    attempts: 0,
    createdAt: operation.createdAt,
    updatedAt: operation.createdAt,
  };
  await db.domainOperations.put(operation);
  await db.syncOutbox.put(outbox);
}

/**
 * Build + enqueue one domain operation inside the current Dexie transaction.
 * `identity` must be part of the transaction table list.
 */
export async function enqueue(input: {
  aggregateType: string;
  aggregateId: string;
  operationType: DomainOperation['operationType'];
  expectedVersion?: number;
  payload: Record<string, any>;
  createdAt: string;
}): Promise<DomainOperation> {
  const opIdentity = await nextOperationIdentity();
  const operation: DomainOperation = {
    operationId: opIdentity.operationId,
    terminalId: opIdentity.terminalId,
    sequence: opIdentity.sequence,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    operationType: input.operationType,
    expectedVersion: input.expectedVersion ?? 0,
    payload: input.payload,
    createdAt: input.createdAt,
    protocolVersion: POS_SYNC_PROTOCOL_VERSION,
    schemaVersion: POS_SCHEMA_VERSION,
  };
  await appendOperation(operation);
  return operation;
}

export function orderKey(orderId: string): string {
  return orderId.includes(':') ? orderId : `order:${orderId}`;
}

/**
 * Ownership gate for cashier mutations.
 * - Online: auto-take ownership when missing or foreign (no NOT_OWNER).
 * - Offline: unowned → claim; foreign → assertCashierOwner (NOT_OWNER).
 * The returned patch must be merged into the outgoing MERGE so the gateway
 * records the new owner too.
 */
export function ownerPatchFor(existing: OrderRecord, terminalId: string): { owner_terminal_id: string } | null {
  if (!existing.owner_terminal_id) return { owner_terminal_id: terminalId };
  if (existing.owner_terminal_id === terminalId) return null;
  // Online: transfer ownership to this terminal instead of blocking.
  if (isPosStoreEffectivelyConnected()) {
    return { owner_terminal_id: terminalId };
  }
  assertCashierOwner(existing, terminalId);
  return null;
}

/** Load an order for mutation, importing `seed` when Dexie does not have it yet. */
export async function requireLocalOrder(
  orderId: string,
  seed?: { order: any; items?: any[] },
): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const key = orderKey(orderId);
  const existing = await db.orders.get(key);
  if (existing) return existing;
  if (!seed?.order) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
  return ensureLocalOrder({ order: { ...seed.order, id: key }, items: seed.items });
}

// ---------------------------------------------------------------------------
// Print audit
// ---------------------------------------------------------------------------

/** Record a temp/final bill print (Dexie `orderPrints` + CREATE_RECORD order_print). */
export async function recordOrderPrint(input: {
  orderId: string;
  printType: 'temp' | 'final';
  userId?: string | null;
  isOverride?: boolean;
  isDuplicate?: boolean;
}): Promise<OrderPrintRecord> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();
  const key = orderKey(input.orderId);
  const row: OrderPrintRecord = {
    id: recordId('order_print'),
    order: key,
    print_type: input.printType,
    printed_by: input.userId ? refId(input.userId) : null,
    printed_at: createdAt,
    is_override: input.isOverride === true,
    is_duplicate: input.isDuplicate === true,
  };
  await db.transaction('rw', [db.orderPrints, db.domainOperations, db.syncOutbox, db.identity], async () => {
    await db.orderPrints.put(row);
    await enqueue({
      aggregateType: 'order_print',
      aggregateId: row.id,
      operationType: 'CREATE_RECORD',
      payload: { table: 'order_print', recordId: row.id, data: row },
      createdAt,
    });
  });
  notifyWrite();
  return row;
}

/** Print rows for the given orders (for max-attempt gates / "temp printed" badges). */
export async function getOrderPrints(orderIds: string[]): Promise<OrderPrintRecord[]> {
  const keys = [...new Set(orderIds.filter(Boolean).map(orderKey))];
  if (keys.length === 0) return [];
  return getPosStoreDatabase().orderPrints.where('order').anyOf(keys).toArray();
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function createCustomer(input: Record<string, any>): Promise<CustomerRecord> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();
  const id = recordId('customer', input.id ? String(input.id) : undefined);
  const { id: _ignored, ...rest } = input;
  const customer: CustomerRecord = {
    ...rest,
    id,
    name: String(input.name ?? ''),
    tags: Array.isArray(input.tags) ? input.tags : [],
  };
  await db.transaction('rw', [db.customers, db.domainOperations, db.syncOutbox, db.identity], async () => {
    await db.customers.put(customer);
    await enqueue({
      aggregateType: 'customer',
      aggregateId: id,
      operationType: 'CREATE_RECORD',
      payload: { table: 'customer', recordId: id, data: customer },
      createdAt,
    });
  });
  notifyWrite();
  return customer;
}

// ---------------------------------------------------------------------------
// Table locks (floor_table.is_locked / locked_by / locked_at)
// ---------------------------------------------------------------------------

async function writeTableLock(
  tableId: string,
  lock: { is_locked: boolean; locked_by: string | null; locked_at: string | null },
): Promise<TableLockRecord> {
  const db = getPosStoreDatabase();
  const id = tableId.includes(':') ? tableId : `floor_table:${tableId}`;
  const createdAt = nowIso();
  const row: TableLockRecord = { id, ...lock, updated_at: createdAt };
  await db.transaction(
    'rw',
    [db.tableLocks, db.catalog, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      await db.tableLocks.put(row);
      const catalog = await db.catalog.get(id);
      if (catalog) {
        await db.catalog.put({
          ...catalog,
          payload: { ...catalog.payload, ...lock },
        });
      }
      await enqueue({
        aggregateType: 'floor_table',
        aggregateId: id,
        operationType: 'MERGE_RECORD',
        payload: { table: 'floor_table', recordId: id, data: lock },
        createdAt,
      });
    },
  );
  notifyWrite();
  return row;
}

export function lockTable(tableId: string, lockedBy: string | null): Promise<TableLockRecord> {
  return writeTableLock(tableId, {
    is_locked: true,
    locked_by: lockedBy ?? null,
    locked_at: nowIso(),
  });
}

export function unlockTable(tableId: string): Promise<TableLockRecord> {
  return writeTableLock(tableId, { is_locked: false, locked_by: null, locked_at: null });
}

/**
 * Refresh `locked_at` for a held table. No-ops if the lock was already
 * released — the check runs inside the same transaction as the write so a
 * concurrent unlock cannot be overwritten by a late heartbeat.
 */
export async function heartbeatTableLock(tableId: string): Promise<TableLockRecord | null> {
  const db = getPosStoreDatabase();
  const id = tableId.includes(':') ? tableId : `floor_table:${tableId}`;
  const createdAt = nowIso();
  let result: TableLockRecord | null = null;
  let wrote = false;

  await db.transaction(
    'rw',
    [db.tableLocks, db.catalog, db.domainOperations, db.syncOutbox, db.identity],
    async () => {
      const existing = await db.tableLocks.get(id);
      if (!existing?.is_locked) {
        result = existing ?? null;
        return;
      }

      const lock = {
        is_locked: true as const,
        locked_by: existing.locked_by ?? null,
        locked_at: createdAt,
      };
      const row: TableLockRecord = { id, ...lock, updated_at: createdAt };
      await db.tableLocks.put(row);
      const catalog = await db.catalog.get(id);
      if (catalog) {
        await db.catalog.put({
          ...catalog,
          payload: { ...catalog.payload, ...lock },
        });
      }
      await enqueue({
        aggregateType: 'floor_table',
        aggregateId: id,
        operationType: 'MERGE_RECORD',
        payload: { table: 'floor_table', recordId: id, data: lock },
        createdAt,
      });
      result = row;
      wrote = true;
    },
  );

  if (wrote) notifyWrite();
  return result;
}

export async function getTableLock(tableId: string): Promise<TableLockRecord | undefined> {
  const db = getPosStoreDatabase();
  const id = tableId.includes(':') ? tableId : `floor_table:${tableId}`;
  return db.tableLocks.get(id);
}

export async function createOrderWithItems(input: CreateOrderInput): Promise<{
  order: OrderRecord;
  items: OrderItemRecord[];
  kitchens: OrderItemKitchenRecord[];
}> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso(input.createdAt);
  const orderId = recordId('order', input.orderId);

  const items: OrderItemRecord[] = [];
  const kitchens: OrderItemKitchenRecord[] = [];
  const itemIds: string[] = [];

  input.items.forEach((line, index) => {
    const built = buildOrderItemRows(orderId, line, index, createdAt, !!line.isAddition);
    itemIds.push(built.item.id);
    items.push(built.item);
    kitchens.push(...built.kitchens);
  });

  const order: OrderRecord = {
    id: orderId,
    status: 'In Progress',
    invoice_number: input.invoiceNumber,
    auto_id: input.autoId,
    covers: input.covers ?? 1,
    floor: input.floorId ?? null,
    table: input.tableId ?? null,
    order_type: input.orderTypeId ?? null,
    customer: input.customerId ?? null,
    user: input.userId ?? null,
    items: itemIds,
    tags: input.tags ?? ['Normal'],
    service_charge: input.serviceCharge ?? 0,
    service_charge_amount: input.serviceChargeAmount ?? 0,
    service_charge_type: input.serviceChargeType ?? 'Percent',
    tax_amount: 0,
    discount_amount: 0,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    owner_terminal_id: identity.terminalId,
    owner_heartbeat_at: createdAt,
    server_version: 1,
  };

  const opIdentity = await nextOperationIdentity();
  const operation: DomainOperation = {
    operationId: opIdentity.operationId,
    terminalId: opIdentity.terminalId,
    sequence: opIdentity.sequence,
    aggregateType: 'order',
    aggregateId: orderId,
    operationType: 'CREATE_RECORD',
    expectedVersion: 0,
    payload: {
      table: 'order',
      recordId: orderId,
      data: order,
      items,
      kitchens,
    },
    createdAt,
    protocolVersion: POS_SYNC_PROTOCOL_VERSION,
    schemaVersion: POS_SCHEMA_VERSION,
  };

  await db.transaction('rw', [db.orders, db.orderItems, db.orderItemKitchens, db.domainOperations, db.syncOutbox, db.identity], async () => {
      await db.orders.put(order);
      await db.orderItems.bulkPut(items);
      if (kitchens.length) await db.orderItemKitchens.bulkPut(kitchens);
      await appendOperation(operation);
  });

  notifyWrite();
  return { order, items, kitchens };
}

export async function mergeOrder(
  orderId: string,
  patch: Record<string, any>,
  options?: { seed?: { order: any; items?: any[] } },
): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso();
  const key = orderId.includes(':') ? orderId : `order:${orderId}`;

  if (!(await db.orders.get(key))) {
    if (!options?.seed?.order) {
      throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
    }
    await ensureLocalOrder({
      order: { ...options.seed.order, id: key },
      items: options.seed.items,
    });
  }

  return db.transaction('rw', [db.orders, db.domainOperations, db.syncOutbox, db.identity], async () => {
      const existing = await db.orders.get(key);
      if (!existing) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(existing, identity.terminalId);

      const next: OrderRecord = {
        ...existing,
        ...patch,
        id: existing.id,
        owner_terminal_id: ownerPatch?.owner_terminal_id ?? existing.owner_terminal_id,
        owner_heartbeat_at: createdAt,
        server_version: existing.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(next);

      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'MERGE_RECORD',
        expectedVersion: existing.server_version,
        payload: {
          table: 'order',
          recordId: key,
          data: { ...patch, ...(ownerPatch ?? {}), owner_heartbeat_at: createdAt },
        },
        createdAt,
      });
      return next;
  }).then((next) => {
    // Notify only after commit so sync sees the new outbox row.
    notifyWrite();
    return next;
  });
}

export async function touchOwnerHeartbeat(orderId: string): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const existing = await db.orders.get(orderId);
  if (!existing) throw new PosStoreError('NOT_FOUND', `Order ${orderId} not found`);
  assertCashierOwner(existing, identity.terminalId);
  const next = { ...existing, owner_heartbeat_at: nowIso() };
  await db.orders.put(next);
  return next;
}

export async function claimOrder(orderId: string, options?: { seed?: { order: any; items?: any[] } }): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso();
  const key = orderId.includes(':') ? orderId : `order:${orderId}`;

  if (!(await db.orders.get(key))) {
    if (options?.seed?.order) {
      await ensureLocalOrder({
        order: { ...options.seed.order, id: key },
        items: options.seed.items,
      });
    }
  }

  return db.transaction('rw', [db.orders, db.domainOperations, db.syncOutbox, db.identity], async () => {
      const existing = await db.orders.get(key);
      if (!existing) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      if (existing.owner_terminal_id && existing.owner_terminal_id !== identity.terminalId) {
        if (!isPosStoreEffectivelyConnected()) {
          throw new PosStoreError('NOT_OWNER', 'Order already has an owner — use steal if stale');
        }
        // Online: claim transfers ownership to this terminal.
      }
      const next: OrderRecord = {
        ...existing,
        owner_terminal_id: identity.terminalId,
        owner_heartbeat_at: createdAt,
        server_version: existing.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(next);
      const opIdentity = await nextOperationIdentity();
      await appendOperation({
        operationId: opIdentity.operationId,
        terminalId: opIdentity.terminalId,
        sequence: opIdentity.sequence,
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'CLAIM_ORDER',
        expectedVersion: existing.server_version,
        payload: { owner_terminal_id: identity.terminalId },
        createdAt,
        protocolVersion: POS_SYNC_PROTOCOL_VERSION,
        schemaVersion: POS_SCHEMA_VERSION,
      });
      return next;
  }).then((next) => {
    notifyWrite();
    return next;
  });
}

export async function releaseOrder(orderId: string): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso();

  return db.transaction('rw', [db.orders, db.domainOperations, db.syncOutbox, db.identity], async () => {
      const existing = await db.orders.get(orderId);
      if (!existing) throw new PosStoreError('NOT_FOUND', `Order ${orderId} not found`);
      assertCashierOwner(existing, identity.terminalId);
      const next: OrderRecord = {
        ...existing,
        owner_terminal_id: '',
        owner_heartbeat_at: createdAt,
        server_version: existing.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(next);
      const opIdentity = await nextOperationIdentity();
      await appendOperation({
        operationId: opIdentity.operationId,
        terminalId: opIdentity.terminalId,
        sequence: opIdentity.sequence,
        aggregateType: 'order',
        aggregateId: orderId,
        operationType: 'RELEASE_ORDER',
        expectedVersion: existing.server_version,
        payload: {},
        createdAt,
        protocolVersion: POS_SYNC_PROTOCOL_VERSION,
        schemaVersion: POS_SCHEMA_VERSION,
      });
      return next;
  });
}

export async function stealOrder(orderId: string): Promise<OrderRecord> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso();

  return db.transaction('rw', [db.orders, db.domainOperations, db.syncOutbox, db.identity], async () => {
      const existing = await db.orders.get(orderId);
      if (!existing) throw new PosStoreError('NOT_FOUND', `Order ${orderId} not found`);
      if (!canStealOrder(existing, identity.terminalId)) {
        throw new PosStoreError(
          'NOT_OWNER',
          'Cannot steal order — owner heartbeat is still fresh',
        );
      }
      const next: OrderRecord = {
        ...existing,
        owner_terminal_id: identity.terminalId,
        owner_heartbeat_at: createdAt,
        server_version: existing.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(next);
      const opIdentity = await nextOperationIdentity();
      await appendOperation({
        operationId: opIdentity.operationId,
        terminalId: opIdentity.terminalId,
        sequence: opIdentity.sequence,
        aggregateType: 'order',
        aggregateId: orderId,
        operationType: 'STEAL_ORDER',
        expectedVersion: existing.server_version,
        payload: {
          previous_owner: existing.owner_terminal_id,
          owner_terminal_id: identity.terminalId,
        },
        createdAt,
        protocolVersion: POS_SYNC_PROTOCOL_VERSION,
        schemaVersion: POS_SCHEMA_VERSION,
      });
      return next;
  });
}

export async function completeKitchenStage(input: {
  kitchenRowId: string;
  nextPendingId?: string | null;
}): Promise<void> {
  const db = getPosStoreDatabase();
  const createdAt = nowIso();

  await db.transaction('rw', [db.orderItemKitchens, db.domainOperations, db.syncOutbox, db.identity], async () => {
      const row = await db.orderItemKitchens.get(input.kitchenRowId);
      if (!row) throw new PosStoreError('NOT_FOUND', 'Kitchen stage row not found');
      await db.orderItemKitchens.put({
        ...row,
        status: 'completed',
        completed_at: createdAt,
      });
      if (input.nextPendingId) {
        const next = await db.orderItemKitchens.get(input.nextPendingId);
        if (next) {
          await db.orderItemKitchens.put({
            ...next,
            status: 'pending',
            activated_at: createdAt,
          });
        }
      }
      const opIdentity = await nextOperationIdentity();
      await appendOperation({
        operationId: opIdentity.operationId,
        terminalId: opIdentity.terminalId,
        sequence: opIdentity.sequence,
        aggregateType: 'order_item_kitchen',
        aggregateId: input.kitchenRowId,
        operationType: 'COMPLETE_KITCHEN_STAGE',
        expectedVersion: 0,
        payload: {
          kitchenRowId: input.kitchenRowId,
          nextPendingId: input.nextPendingId ?? null,
        },
        createdAt,
        protocolVersion: POS_SYNC_PROTOCOL_VERSION,
        schemaVersion: POS_SCHEMA_VERSION,
      });
  });
}

export async function addItemsToOrder(
  orderId: string,
  newItems: CreateOrderInput['items'],
  options?: { seed?: { order: any; items?: any[] } },
): Promise<{ order: OrderRecord; items: OrderItemRecord[]; kitchens: OrderItemKitchenRecord[] }> {
  const db = getPosStoreDatabase();
  const identity = await ensureTerminalIdentity();
  const createdAt = nowIso();
  const key = orderId.includes(':') ? orderId : `order:${orderId}`;

  // Split/merge children are often Surreal-only — import before mutating.
  if (!(await db.orders.get(key))) {
    if (!options?.seed?.order) {
      throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
    }
    await ensureLocalOrder({
      order: { ...options.seed.order, id: key },
      items: options.seed.items,
    });
  }

  // Drop local orphan links before appending so we never MERGE them back to Surreal.
  await reconcileOrderItemLinks(key);

  return db.transaction('rw', [db.orders, db.orderItems, db.orderItemKitchens, db.domainOperations, db.syncOutbox, db.identity], async () => {
      const existing = await db.orders.get(key);
      if (!existing) throw new PosStoreError('NOT_FOUND', `Order ${key} not found`);
      const ownerPatch = ownerPatchFor(existing, identity.terminalId);

      const items: OrderItemRecord[] = [];
      const kitchens: OrderItemKitchenRecord[] = [];
      const priorIds = [...(existing.items ?? [])];
      const itemIds = [...priorIds];

      newItems.forEach((line, index) => {
        const built = buildOrderItemRows(
          key,
          line,
          priorIds.length + index,
          createdAt,
          true,
        );
        itemIds.push(built.item.id);
        items.push(built.item);
        kitchens.push(...built.kitchens);
      });

      const next: OrderRecord = {
        ...existing,
        items: itemIds,
        owner_terminal_id: ownerPatch?.owner_terminal_id ?? existing.owner_terminal_id,
        owner_heartbeat_at: createdAt,
        server_version: existing.server_version + 1,
        updated_at: createdAt,
      };
      await db.orders.put(next);
      await db.orderItems.bulkPut(items);
      if (kitchens.length) await db.orderItemKitchens.bulkPut(kitchens);

      await enqueue({
        aggregateType: 'order',
        aggregateId: key,
        operationType: 'MERGE_RECORD',
        expectedVersion: existing.server_version,
        payload: {
          table: 'order',
          recordId: key,
          // Never send a full items[] replace — gateway appends from `items` children.
          data: {
            updated_at: createdAt,
            owner_heartbeat_at: createdAt,
            ...(ownerPatch ?? {}),
          },
          items,
          kitchens,
        },
        createdAt,
      });
      return { order: next, items, kitchens };
  }).then((result) => {
    notifyWrite();
    return result;
  });
}

/**
 * Take the next reserved integer for `series`. Surreal `invoice_number` and
 * `auto_id` are ints, so there is deliberately no string fallback: when the
 * local pool is exhausted offline the caller must block the create with a toast.
 */
export async function consumeNumber(series: NumberSeries): Promise<number> {
  const db = getPosStoreDatabase();
  return db.transaction('rw', db.numberReservations, async () => {
    const reserved = await db.numberReservations
      .where({ series, status: 'reserved' })
      .sortBy('value');
    const first = reserved[0];
    if (!first) {
      throw new PosStoreError(
        'NUMBERS_EXHAUSTED',
        `No reserved ${series} numbers left — reconnect to the gateway to refill`,
      );
    }
    await db.numberReservations.put({
      ...first,
      status: 'consumed',
      consumed_at: nowIso(),
    });
    return first.value;
  });
}

export function consumeInvoiceNumber(): Promise<number> {
  return consumeNumber('invoice');
}

export function consumeAutoId(): Promise<number> {
  return consumeNumber('auto_id');
}

export async function countReservedNumbers(series: NumberSeries): Promise<number> {
  const db = getPosStoreDatabase();
  return db.numberReservations.where({ series, status: 'reserved' }).count();
}
