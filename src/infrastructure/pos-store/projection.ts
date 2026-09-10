import { getPosStoreDatabase } from './db.ts';
import { applyRemoteOrderProjection } from './catalog.ts';
import {
  CHILD_TABLE_STORES,
  type ChildRecord,
  type OrderItemKitchenRecord,
  type OrderItemRecord,
  type OrderRecord,
  type TableLockRecord,
} from './types.ts';

/** Relations embedded in the gateway `order` snapshot page via FETCH. */
const EMBEDDED_ORDER_RELATIONS: Array<{
  field: 'payments' | 'order_taxes' | 'order_discounts' | 'extras';
  table: keyof typeof CHILD_TABLE_STORES;
}> = [
  { field: 'payments', table: 'order_payment' },
  { field: 'order_taxes', table: 'order_tax' },
  { field: 'order_discounts', table: 'order_discount' },
  { field: 'extras', table: 'order_extras' },
];

function idOf(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object' && 'id' in (value as object)) {
    return idOf((value as { id: unknown }).id);
  }
  const raw = String(value);
  return raw && raw !== 'undefined' && raw !== '[object Object]' ? raw : null;
}

function keyed(table: string, id: string): string {
  return id.includes(':') ? id : `${table}:${id}`;
}

/** Surreal link values → plain "table:id" strings; nested rows stay objects. */
function normalizeChildRow(table: string, row: any, orderId?: string | null): ChildRecord | null {
  if (!row || typeof row !== 'object') return null;
  const id = idOf(row.id);
  if (!id) return null;
  const out: ChildRecord = { ...row, id: keyed(table, id) };
  for (const [key, value] of Object.entries(out)) {
    if (key === 'id') continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && 'id' in value
      && Object.keys(value).length === 1) {
      out[key] = String((value as { id: unknown }).id);
    }
  }
  if (orderId && (out.order == null || typeof out.order === 'object')) {
    out.order = orderId;
  } else if (out.order != null) {
    out.order = idOf(out.order);
  }
  return out;
}

async function putChildRows(table: string, rows: ChildRecord[]): Promise<void> {
  if (!rows.length) return;
  const db = getPosStoreDatabase();
  const store = db.childStore(table);
  if (!store) return;
  await store.bulkPut(rows);
}

/**
 * Snapshot `order` rows arrive with payments / taxes / discounts / extras /
 * coupon FETCHed inline. Split them into child stores and keep id arrays on
 * the order so hydration joins them back the same way for every code path.
 */
export async function projectSnapshotOrder(record: any): Promise<void> {
  const orderId = idOf(record?.id);
  if (!orderId) return;
  const db = getPosStoreDatabase();
  const orderPatch: Record<string, any> = { ...record, id: orderId };

  await db.transaction('rw', [db.orders, db.orderItems, ...db.childStores()], async () => {
    for (const { field, table } of EMBEDDED_ORDER_RELATIONS) {
      const raw = Array.isArray(record[field]) ? record[field] : [];
      const rows: ChildRecord[] = [];
      const ids: string[] = [];
      for (const entry of raw) {
        const normalized = normalizeChildRow(table, entry, orderId);
        if (normalized) {
          rows.push(normalized);
          ids.push(normalized.id);
        } else {
          const bare = idOf(entry);
          if (bare) ids.push(keyed(table, bare));
        }
      }
      await putChildRows(table, rows);
      orderPatch[field] = ids;
    }

    const coupon = record.coupon;
    if (coupon && typeof coupon === 'object') {
      const normalized = normalizeChildRow('order_coupon', coupon, orderId);
      if (normalized) {
        await putChildRows('order_coupon', [normalized]);
        orderPatch.coupon = normalized.id;
      }
    } else {
      orderPatch.coupon = idOf(coupon);
    }

    for (const key of ['floor', 'table', 'order_type', 'customer', 'user', 'cashier', 'tax', 'discount', 'discount_manager']) {
      if (key in orderPatch) orderPatch[key] = idOf(orderPatch[key]);
    }

    await applyRemoteOrderProjection({
      order: {
        ...orderPatch,
        items: Array.isArray(record.items) ? record.items.map((entry: unknown) => idOf(entry)).filter(Boolean) : [],
        created_at: String(record.created_at ?? new Date().toISOString()),
        owner_terminal_id: String(record.owner_terminal_id ?? ''),
        owner_heartbeat_at: String(record.owner_heartbeat_at ?? new Date().toISOString()),
        server_version: Number(record.server_version ?? 1),
        status: String(record.status ?? 'In Progress'),
      } as any,
      keepRelations: true,
    });
  });
}

export async function projectSnapshotRecords(table: string, records: any[]): Promise<void> {
  if (table === 'order_item') {
    await applyRemoteOrderProjection({
      items: records.map((record: any) => ({
        ...record,
        id: String(record.id),
        order: idOf(record.order),
        item: String(record.item),
        created_at: String(record.created_at ?? new Date().toISOString()),
      })) as OrderItemRecord[],
    });
    return;
  }
  if (table === 'order_item_kitchen') {
    const db = getPosStoreDatabase();
    await db.orderItemKitchens.bulkPut(
      records.map((record: any) => ({
        ...record,
        id: String(record.id),
        kitchen: idOf(record.kitchen),
        order_item: idOf(record.order_item),
        stage: idOf(record.stage),
        workflow: idOf(record.workflow),
      })) as OrderItemKitchenRecord[],
    );
    return;
  }
  if (table === 'floor_table') {
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    await db.tableLocks.bulkPut(
      records
        .map((record: any) => ({
          id: String(record.id),
          is_locked: !!record.is_locked,
          locked_by: record.locked_by ?? null,
          locked_at: record.locked_at ? String(record.locked_at) : null,
          updated_at: now,
        }))
        .filter((row) => row.id),
    );
    // Catalog copy is still needed for geometry / names.
    return;
  }
  const store = getPosStoreDatabase().childStore(table);
  if (store) {
    const rows = records
      .map((record) => normalizeChildRow(table, record))
      .filter((row): row is ChildRecord => !!row);
    await putChildRows(table, rows);
  }
}

async function mergeChildRow(table: string, id: string, patch: Record<string, any>, orderId?: string | null) {
  const db = getPosStoreDatabase();
  const store = db.childStore(table);
  if (!store) return;
  const key = keyed(table, id);
  const existing = await store.get(key);
  const normalized = normalizeChildRow(table, { ...(existing ?? {}), ...patch, id: key }, orderId ?? existing?.order);
  if (normalized) await store.put(normalized);
}

async function patchOrder(orderId: string, patch: Record<string, any>): Promise<void> {
  const db = getPosStoreDatabase();
  const existing = await db.orders.get(orderId);
  if (!existing) return;
  await db.orders.put({ ...existing, ...patch, id: orderId } as OrderRecord);
}

async function unionOrderRelation(orderId: string, relation: string, ids: string[]): Promise<void> {
  const db = getPosStoreDatabase();
  const existing = await db.orders.get(orderId);
  if (!existing) return;
  const current = Array.isArray((existing as any)[relation]) ? (existing as any)[relation].map(String) : [];
  const set = new Set<string>(current);
  for (const id of ids) set.add(id);
  await db.orders.put({ ...existing, [relation]: [...set] } as OrderRecord);
}

export async function projectTableLock(row: {
  id: string;
  is_locked?: boolean | null;
  locked_by?: string | null;
  locked_at?: string | null;
}): Promise<void> {
  const db = getPosStoreDatabase();
  const lock: TableLockRecord = {
    id: String(row.id),
    is_locked: !!row.is_locked,
    locked_by: row.is_locked ? row.locked_by ?? null : null,
    locked_at: row.is_locked ? row.locked_at ?? null : null,
    updated_at: new Date().toISOString(),
  };
  await db.transaction('rw', [db.tableLocks, db.catalog], async () => {
    await db.tableLocks.put(lock);
    const catalog = await db.catalog.get(lock.id);
    if (catalog) {
      await db.catalog.put({
        ...catalog,
        payload: {
          ...catalog.payload,
          is_locked: lock.is_locked,
          locked_by: lock.locked_by,
          locked_at: lock.locked_at,
        },
      });
    }
  });
}

/**
 * Apply one gateway `sync_event` to Dexie. Handles every operation type the
 * gateway can emit; events for unknown tables are ignored.
 */
export async function applyRemoteEvent(event: any): Promise<void> {
  const payload = event?.payload ?? event;
  if (!payload) return;
  const type = String(event?.operation_type ?? event?.operationType ?? payload.operationType ?? '');
  const table = String(payload.table ?? event?.aggregate_type ?? event?.aggregateType ?? '');
  const recordId = idOf(payload.recordId) ?? idOf(event?.aggregate_id) ?? idOf(event?.aggregateId);
  const version = event?.version != null ? Number(event.version) : null;
  const orderId = idOf(payload.orderId)
    ?? (table === 'order' ? recordId : null)
    ?? (String(event?.aggregate_type ?? '') === 'order' ? idOf(event?.aggregate_id) : null);
  const db = getPosStoreDatabase();

  if (type === 'COMPLETE_KITCHEN_STAGE') {
    const now = new Date().toISOString();
    await db.transaction('rw', db.orderItemKitchens, async () => {
      const row = payload.kitchenRowId ? await db.orderItemKitchens.get(String(payload.kitchenRowId)) : null;
      if (row) await db.orderItemKitchens.put({ ...row, status: 'completed', completed_at: row.completed_at ?? now });
      const next = payload.nextPendingId ? await db.orderItemKitchens.get(String(payload.nextPendingId)) : null;
      if (next) await db.orderItemKitchens.put({ ...next, status: 'pending', activated_at: next.activated_at ?? now });
    });
    return;
  }

  if (type === 'CREATE_PAYMENT') {
    if (!recordId || !orderId) return;
    await db.transaction('rw', [db.orders, db.orderPayments], async () => {
      const row = normalizeChildRow('order_payment', { ...(payload.data ?? {}), id: recordId }, orderId);
      if (row) await db.orderPayments.put(row as any);
      await unionOrderRelation(orderId, 'payments', [keyed('order_payment', recordId)]);
      if (version != null) await patchOrder(orderId, { server_version: version });
    });
    return;
  }

  if (type === 'REPLACE_ORDER_RELATION') {
    if (!orderId) return;
    const relation = String(payload.relation ?? '');
    const childTable = String(payload.table ?? '');
    const store = db.childStore(childTable);
    if (!store || !relation) return;
    if (!(await db.orders.get(orderId))) return;
    await db.transaction('rw', [db.orders, store], async () => {
      const rows = (Array.isArray(payload.rows) ? payload.rows : [])
        .map((row: any) => normalizeChildRow(childTable, row, orderId))
        .filter((row: ChildRecord | null): row is ChildRecord => !!row);
      const ids = rows.map((row) => row.id);
      const stale = await store.where('order').equals(orderId).toArray();
      const keep = new Set(ids);
      await store.bulkDelete(stale.map((row) => row.id).filter((id) => !keep.has(id)));
      await store.bulkPut(rows);
      const extra = { ...(payload.data ?? {}) };
      delete extra.items;
      await patchOrder(orderId, {
        ...extra,
        [relation]: ids,
        ...(version != null ? { server_version: version } : {}),
      });
    });
    return;
  }

  if (type === 'CLAIM_ORDER' || type === 'STEAL_ORDER' || type === 'RELEASE_ORDER') {
    if (!orderId) return;
    const owner = type === 'RELEASE_ORDER'
      ? ''
      : String(payload.owner_terminal_id ?? payload.data?.owner_terminal_id ?? event?.terminal_id ?? '');
    await patchOrder(orderId, {
      owner_terminal_id: owner,
      owner_heartbeat_at: String(event?.created_at ?? new Date().toISOString()),
      ...(version != null ? { server_version: version } : {}),
    });
    return;
  }

  if (table === 'order') {
    if (!(payload.data || payload.items || payload.kitchens)) return;
    const data = payload.data ?? {};
    const orderPatch: Record<string, any> = { ...data, id: String(recordId ?? data.id ?? '') };
    if (data.server_version != null || version != null) {
      orderPatch.server_version = Number(data.server_version ?? version ?? 1);
    }
    for (const key of ['owner_terminal_id', 'owner_heartbeat_at', 'created_at'] as const) {
      if (data[key] != null) orderPatch[key] = String(data[key]);
      else delete orderPatch[key];
    }
    if (Array.isArray(payload.replaceItems)) orderPatch.items = payload.replaceItems.map(String);
    else if (Array.isArray(data.items)) orderPatch.items = data.items.map(String);
    else delete orderPatch.items;
    if (!orderPatch.id) return;
    await db.transaction('rw', [db.orders, db.orderItems, db.orderItemKitchens], async () => {
      await applyRemoteOrderProjection({
        order: orderPatch as any,
        items: payload.items,
        // CREATE events carry the full relation id arrays; MERGE patches only
        // what changed — both are safe to keep as strings.
        keepRelations: true,
      });
      if (Array.isArray(payload.kitchens) && payload.kitchens.length) {
        await db.orderItemKitchens.bulkPut(payload.kitchens as OrderItemKitchenRecord[]);
      }
    });
    return;
  }

  if (table === 'order_item') {
    if (!recordId) return;
    await db.transaction('rw', [db.orderItems, db.orderItemKitchens], async () => {
      if (type === 'CREATE_RECORD') {
        const row = normalizeChildRow('order_item', { ...(payload.data ?? {}), id: recordId }, orderId);
        if (row) await db.orderItems.put(row as any);
      } else {
        await mergeChildRow('order_item', recordId, payload.data ?? {}, orderId);
      }
      if (Array.isArray(payload.kitchens) && payload.kitchens.length) {
        await db.orderItemKitchens.bulkPut(payload.kitchens as OrderItemKitchenRecord[]);
      }
    });
    return;
  }

  if (table === 'order_item_kitchen') {
    if (!recordId) return;
    await mergeChildRow('order_item_kitchen', recordId, payload.data ?? {});
    return;
  }

  if (table === 'floor_table') {
    if (!recordId) return;
    const data = payload.data ?? {};
    const existing = await db.tableLocks.get(recordId);
    await projectTableLock({
      id: recordId,
      is_locked: data.is_locked ?? existing?.is_locked ?? false,
      locked_by: data.locked_by ?? existing?.locked_by ?? null,
      locked_at: data.locked_at ?? existing?.locked_at ?? null,
    });
    return;
  }

  const store = db.childStore(table);
  if (store && recordId) {
    await db.transaction('rw', [db.orders, store], async () => {
      const row = normalizeChildRow(table, { ...(payload.data ?? {}), id: recordId }, orderId);
      if (row) await store.put(row);
      if (orderId && payload.linkRelation) {
        await unionOrderRelation(orderId, String(payload.linkRelation), [keyed(table, recordId)]);
      }
      if (orderId && payload.linkField) {
        await patchOrder(orderId, { [String(payload.linkField)]: keyed(table, recordId) });
      }
    });
  }
}
