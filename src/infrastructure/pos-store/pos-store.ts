import { getPosStoreDatabase } from './db.ts';
import { ensureTerminalIdentity } from './identity.ts';
import * as commands from './commands.ts';
import { notifyWrite } from './commands.ts';
import * as orderCommands from './order-commands.ts';
import * as catalog from './catalog.ts';
import {
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_BACKOFF_MAX_MS,
  OUTBOX_MAX_ATTEMPTS,
  type CreateOrderInput,
  type DomainOperation,
  type NumberSeries,
  type OrderRecord,
  type SyncConflictRow,
  type SyncOutboxRow,
  type TerminalIdentity,
} from './types.ts';

/**
 * Application-facing local store. Screens talk only to this facade —
 * never branch on online/offline or on-prem vs cloud.
 */
export class PosStore {
  async initialize(): Promise<TerminalIdentity> {
    const identity = await ensureTerminalIdentity();
    const db = getPosStoreDatabase();
    const cursor = await db.syncCursor.get('singleton');
    if (!cursor) {
      await db.syncCursor.put({
        id: 'singleton',
        cursor: 0,
        hydrated: false,
        snapshotResumeToken: null,
      });
    }
    return identity;
  }

  getTerminalIdentity(): Promise<TerminalIdentity> {
    return ensureTerminalIdentity();
  }

  /**
   * Nuclear local reset for Settings → Reload cache. Wipes every store except
   * terminal `identity` (so ownership / handshake keep the same terminalId),
   * then marks the sync cursor unhydrated so the next snapshot rebuilds from
   * the gateway. Never call this while offline — there is no warm path without
   * the server.
   */
  async clearLocalData(): Promise<void> {
    const db = getPosStoreDatabase();
    const identity = await db.identity.get('singleton');
    const tables = [
      db.orders,
      db.orderItems,
      db.orderItemKitchens,
      db.orderPayments,
      db.orderVoids,
      db.orderRefunds,
      db.orderTaxes,
      db.orderDiscounts,
      db.orderCoupons,
      db.orderExtras,
      db.couponRedemptions,
      db.orderSplits,
      db.orderMerges,
      db.orderPrints,
      db.customers,
      db.tableLocks,
      db.catalog,
      db.domainOperations,
      db.syncOutbox,
      db.syncCursor,
      db.syncConflicts,
      db.numberReservations,
    ];
    await db.transaction('rw', [...tables, db.identity], async () => {
      await Promise.all(tables.map((table) => table.clear()));
      if (identity) {
        await db.identity.put(identity);
      }
      await db.syncCursor.put({
        id: 'singleton',
        cursor: 0,
        hydrated: false,
        snapshotResumeToken: null,
      });
    });
    notifyWrite();
  }

  createOrderWithItems(input: CreateOrderInput) {
    return commands.createOrderWithItems(input);
  }

  ensureLocalOrder(source: { order: any; items?: any[] }) {
    return commands.ensureLocalOrder(source);
  }

  addItemsToOrder(
    orderId: string,
    items: CreateOrderInput['items'],
    options?: { seed?: { order: any; items?: any[] } },
  ) {
    return commands.addItemsToOrder(orderId, items, options);
  }

  mergeOrder(
    orderId: string,
    patch: Record<string, any>,
    options?: { seed?: { order: any; items?: any[] } },
  ) {
    return commands.mergeOrder(orderId, patch, options);
  }

  claimOrder(orderId: string, options?: { seed?: { order: any; items?: any[] } }) {
    return commands.claimOrder(orderId, options);
  }

  releaseOrder(orderId: string) {
    return commands.releaseOrder(orderId);
  }

  stealOrder(orderId: string) {
    return commands.stealOrder(orderId);
  }

  touchOwnerHeartbeat(orderId: string) {
    return commands.touchOwnerHeartbeat(orderId);
  }

  completeKitchenStage(input: { kitchenRowId: string; nextPendingId?: string | null }) {
    return commands.completeKitchenStage(input);
  }

  /** Next reserved invoice int; throws `NUMBERS_EXHAUSTED` when the pool is empty. */
  consumeInvoiceNumber() {
    return commands.consumeInvoiceNumber();
  }

  /** Next reserved auto_id int; throws `NUMBERS_EXHAUSTED` when the pool is empty. */
  consumeAutoId() {
    return commands.consumeAutoId();
  }

  countReservedNumbers(series: NumberSeries) {
    return commands.countReservedNumbers(series);
  }

  /** Local child rows (payments, taxes, discounts, …) for one order. */
  getOrderChildren(orderId: string) {
    return catalog.getOrderChildren(orderId);
  }

  createCustomer(input: Record<string, any>) {
    return commands.createCustomer(input);
  }

  recordOrderPrint(input: Parameters<typeof commands.recordOrderPrint>[0]) {
    return commands.recordOrderPrint(input);
  }

  getOrderPrints(orderIds: string[]) {
    return commands.getOrderPrints(orderIds);
  }

  // --- order lifecycle (Dexie first, outbox second) -------------------------

  voidOrderItems(input: orderCommands.VoidOrderItemsInput) {
    return orderCommands.voidOrderItems(input);
  }

  recomputeOrderTaxes(orderId: string, options?: { extraPatch?: Record<string, any>; seed?: { order: any; items?: any[] } }) {
    return orderCommands.recomputeOrderTaxes(orderId, options);
  }

  replaceOrderRelation(
    orderId: string,
    relation: 'order_discounts' | 'extras',
    rows: Array<Record<string, any>>,
    extraPatch?: Record<string, any>,
    seed?: { order: any; items?: any[] },
  ) {
    return orderCommands.replaceOrderRelation(orderId, relation, rows, extraPatch, seed);
  }

  saveOrderDraft(
    orderId: string,
    draft: Parameters<typeof orderCommands.saveOrderDraft>[1],
    seed?: { order: any; items?: any[] },
  ) {
    return orderCommands.saveOrderDraft(orderId, draft, seed);
  }

  settleOrder(input: orderCommands.SettleOrderInput) {
    return orderCommands.settleOrder(input);
  }

  setOrderStatus(
    orderId: string,
    status: string,
    options?: { tags?: string[]; seed?: { order: any; items?: any[] }; extra?: Record<string, any> },
  ) {
    return orderCommands.setOrderStatus(orderId, status, options);
  }

  refundOrder(input: orderCommands.RefundOrderInput) {
    return orderCommands.refundOrder(input);
  }

  splitOrder(input: orderCommands.SplitOrderInput) {
    return orderCommands.splitOrder(input);
  }

  mergeOrders(input: orderCommands.MergeOrdersInput) {
    return orderCommands.mergeOrders(input);
  }

  fireOrderItems(input: Parameters<typeof orderCommands.fireOrderItems>[0]) {
    return orderCommands.fireOrderItems(input);
  }

  updateKitchenStage(kitchenRowId: string, patch: Record<string, any>) {
    return orderCommands.updateKitchenStage(kitchenRowId, patch);
  }

  skipKitchenStage(input: { kitchenRowId: string; userId?: string | null }) {
    return orderCommands.skipKitchenStage(input);
  }

  recallKitchenStage(input: { kitchenRowId: string; userId: string }) {
    return orderCommands.recallKitchenStage(input);
  }

  cancelItemKitchenStages(orderItemId: string) {
    return orderCommands.cancelItemKitchenStages(orderItemId);
  }

  completeKitchenStages(input: { kitchenRowIds: string[]; userId?: string | null }) {
    return orderCommands.completeKitchenStages(input);
  }

  async getKitchenRow(kitchenRowId: string) {
    return getPosStoreDatabase().orderItemKitchens.get(kitchenRowId);
  }

  /** KDS rows for a kitchen with order_item / dish / order joins from Dexie. */
  getKitchenRowsHydrated(kitchenId: string, options?: { sinceIso?: string }) {
    return catalog.getKitchenRowsHydrated(kitchenId, options);
  }

  async getOrder(orderId: string) {
    const key = orderId.includes(':') ? orderId : `order:${orderId}`;
    return getPosStoreDatabase().orders.get(key);
  }

  async getOrderItemKitchens(orderItemIds: string[]) {
    if (orderItemIds.length === 0) return [];
    return getPosStoreDatabase().orderItemKitchens.where('order_item').anyOf(orderItemIds).toArray();
  }

  lockTable(tableId: string, lockedBy: string | null) {
    return commands.lockTable(tableId, lockedBy);
  }

  unlockTable(tableId: string) {
    return commands.unlockTable(tableId);
  }

  heartbeatTableLock(tableId: string) {
    return commands.heartbeatTableLock(tableId);
  }

  getTableLock(tableId: string) {
    return commands.getTableLock(tableId);
  }

  async getTableLocks() {
    return getPosStoreDatabase().tableLocks.toArray();
  }

  getOpenOrders() {
    return catalog.getOpenOrders();
  }

  /** Prune orphan order.items links and scrub stale outbox item arrays. */
  reconcileOrderItemLinks(orderId?: string) {
    return catalog.reconcileOrderItemLinks(orderId);
  }

  /** Open orders in the legacy FETCH shape (items.item, user, table, order_type…). */
  getOpenOrdersHydrated() {
    return catalog.getOpenOrdersHydrated();
  }

  getOpenTablelessOrdersHydrated() {
    return catalog.getOpenTablelessOrdersHydrated();
  }

  getDeliveryOrdersHydrated(statuses?: string[]) {
    return catalog.getDeliveryOrdersHydrated(statuses);
  }

  getKitchenRowsSince(sinceIso: string) {
    return catalog.getKitchenRowsSince(sinceIso);
  }

  getKitchensHydrated() {
    return catalog.getKitchensHydrated();
  }

  getKitchenRowHydratedForPrint(kitchenRowId: string) {
    return catalog.getKitchenRowHydratedForPrint(kitchenRowId);
  }

  /** Open orders + closed orders created in the window (Orders screen history). */
  getRecentOrdersHydrated(options: { sinceIso: string; untilIso?: string }) {
    return catalog.getRecentOrdersHydrated(options);
  }

  /** One order hydrated in the legacy FETCH shape, or null when Dexie lacks it. */
  async getOrderHydrated(orderId: string) {
    const key = orderId.includes(':') ? orderId : `order:${orderId}`;
    const order = await getPosStoreDatabase().orders.get(key);
    if (!order) return null;
    const [hydrated] = await catalog.hydrateOrders([order]);
    return hydrated ?? null;
  }

  hydrateOrders(orders: OrderRecord[]) {
    return catalog.hydrateOrders(orders);
  }

  getOrderWithItems(orderId: string) {
    return catalog.getOrderWithItems(orderId);
  }

  loadHydratedCatalog() {
    return catalog.loadHydratedCatalog();
  }

  getActivePaymentTypes() {
    return catalog.getActivePaymentTypes();
  }

  getPaymentTypesForTable(tableId: string | null | undefined) {
    return catalog.getPaymentTypesForTable(tableId);
  }

  getActiveTaxes() {
    return catalog.getActiveTaxes();
  }

  getApplicableExtras(context: catalog.ExtraApplicabilityContext) {
    return catalog.getApplicableExtras(context);
  }

  getActiveDiscountRules() {
    return catalog.getActiveDiscountRules();
  }

  getActiveDiscountReasons() {
    return catalog.getActiveDiscountReasons();
  }

  findActiveCouponByCode(code: string) {
    return catalog.findActiveCouponByCode(code);
  }

  getGlobalSetting(key: string) {
    return catalog.getGlobalSetting(key);
  }

  getUserSettingOrGlobal(key: string, userId?: string | null) {
    return catalog.getUserSettingOrGlobal(key, userId);
  }

  countCouponRedemptions(options: { couponId: string; userId?: string | null }) {
    return catalog.countCouponRedemptions(options);
  }

  searchCustomers(query: string, limit?: number) {
    return catalog.searchCustomers(query, limit);
  }

  upsertCatalogRecords(table: string, records: any[]) {
    return catalog.upsertCatalogRecords(table, records);
  }

  applyRemoteOrderProjection(payload: {
    order?: Partial<import('./types.ts').OrderRecord> & { id?: string };
    items?: import('./types.ts').OrderItemRecord[];
  }) {
    return catalog.applyRemoteOrderProjection(payload);
  }

  async getPendingOutbox(): Promise<Array<SyncOutboxRow & { operation?: DomainOperation }>> {
    const db = getPosStoreDatabase();
    const rows = await db.syncOutbox
      .where('status')
      .anyOf(['pending', 'failed'])
      .sortBy('createdAt');
    const withOps = [];
    for (const row of rows) {
      const operation = await db.domainOperations.get(row.operationId);
      withOps.push({ ...row, operation });
    }
    return withOps;
  }

  async markOutboxAccepted(operationIds: string[]): Promise<void> {
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const id of operationIds) {
        const row = await db.syncOutbox.get(id);
        if (row) {
          await db.syncOutbox.put({
            ...row,
            status: 'accepted',
            updatedAt: now,
          });
        }
      }
    });
  }

  /**
   * Earliest time the outbox may be pushed again, or `null` when nothing is in
   * backoff. Backoff is evaluated over the whole outbox (not per row) so ops for
   * the same aggregate are never pushed out of sequence.
   */
  async getOutboxBackoffUntil(): Promise<string | null> {
    const db = getPosStoreDatabase();
    const rows = await db.syncOutbox.where('status').anyOf(['pending', 'failed']).toArray();
    let latest: string | null = null;
    for (const row of rows) {
      if (row.nextAttemptAt && (!latest || row.nextAttemptAt > latest)) latest = row.nextAttemptAt;
    }
    if (!latest || latest <= new Date().toISOString()) return null;
    return latest;
  }

  /**
   * Transport failure (gateway unreachable / 5xx): bump `attempts`, schedule an
   * exponential backoff and flag rows as `failed` once OUTBOX_MAX_ATTEMPTS is hit.
   */
  async markOutboxPushFailed(operationIds: string[], error: string): Promise<void> {
    const db = getPosStoreDatabase();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const id of operationIds) {
        const row = await db.syncOutbox.get(id);
        if (!row || (row.status !== 'pending' && row.status !== 'failed')) continue;
        const attempts = (row.attempts ?? 0) + 1;
        const delay = Math.min(OUTBOX_BACKOFF_BASE_MS * 2 ** (attempts - 1), OUTBOX_BACKOFF_MAX_MS);
        await db.syncOutbox.put({
          ...row,
          attempts,
          status: attempts >= OUTBOX_MAX_ATTEMPTS ? 'failed' : 'pending',
          lastError: error,
          nextAttemptAt: new Date(nowMs + delay).toISOString(),
          updatedAt: now,
        });
      }
    });
  }

  async markOutboxConflict(operationId: string, code: string, message: string): Promise<void> {
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    await db.transaction('rw', db.syncOutbox, db.syncConflicts, db.domainOperations, async () => {
      const operation = await db.domainOperations.get(operationId);
      const conflict: SyncConflictRow = {
        id: `${operationId}:${code}`,
        operationId,
        code,
        message,
        createdAt: now,
        resolved: false,
        aggregateType: operation?.aggregateType,
        aggregateId: operation?.aggregateId,
        operationType: operation?.operationType,
      };
      const row = await db.syncOutbox.get(operationId);
      if (row) {
        await db.syncOutbox.put({
          ...row,
          status: 'conflict',
          lastError: message,
          nextAttemptAt: null,
          updatedAt: now,
        });
      }
      await db.syncConflicts.put(conflict);
    });
  }

  /**
   * Re-queue a conflicted op: refresh expectedVersion from the local order and
   * move the outbox row back to pending. Shared by single Retry and Sync all.
   */
  private async requeueConflictOperation(operationId: string, now: string): Promise<boolean> {
    const db = getPosStoreDatabase();
    const operation = await db.domainOperations.get(operationId);
    if (operation && operation.aggregateType === 'order' && operation.aggregateId) {
      const order = await db.orders.get(operation.aggregateId);
      if (order && typeof order.server_version === 'number') {
        await db.domainOperations.put({
          ...operation,
          expectedVersion: order.server_version,
        });
      }
    }
    const row = await db.syncOutbox.get(operationId);
    if (!row || row.status === 'discarded') return false;
    await db.syncOutbox.put({
      ...row,
      status: 'pending',
      attempts: 0,
      lastError: undefined,
      nextAttemptAt: null,
      updatedAt: now,
    });
    await this.resolveConflictRows(operationId);
    return true;
  }

  /** Operator chose "retry": re-queue the op and clear its conflict rows. */
  async retryConflict(operationId: string): Promise<void> {
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    await db.transaction(
      'rw',
      db.syncOutbox,
      db.syncConflicts,
      db.domainOperations,
      db.orders,
      async () => {
        await this.requeueConflictOperation(operationId, now);
      },
    );
  }

  /**
   * Re-queue every open conflict (version refresh + pending). Returns how many
   * ops were moved back onto the outbox for the next force push.
   */
  async retryAllConflicts(): Promise<number> {
    const conflicts = await this.getOpenConflicts();
    if (conflicts.length === 0) return 0;
    const ids = [...new Set(conflicts.map((row) => row.operationId))];
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    let count = 0;
    await db.transaction(
      'rw',
      db.syncOutbox,
      db.syncConflicts,
      db.domainOperations,
      db.orders,
      async () => {
        for (const operationId of ids) {
          if (await this.requeueConflictOperation(operationId, now)) count += 1;
        }
      },
    );
    return count;
  }

  /** Operator chose "discard": drop the op (kept for audit) and clear its conflict rows. */
  async discardConflict(operationId: string): Promise<void> {
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    await db.transaction('rw', db.syncOutbox, db.syncConflicts, async () => {
      const row = await db.syncOutbox.get(operationId);
      if (row) {
        await db.syncOutbox.put({ ...row, status: 'discarded', nextAttemptAt: null, updatedAt: now });
      }
      await this.resolveConflictRows(operationId);
    });
  }

  private async resolveConflictRows(operationId: string): Promise<void> {
    const db = getPosStoreDatabase();
    const rows = await db.syncConflicts.where('operationId').equals(operationId).toArray();
    for (const conflict of rows) {
      if (!conflict.resolved) await db.syncConflicts.put({ ...conflict, resolved: true });
    }
  }

  async getSyncCursor() {
    const db = getPosStoreDatabase();
    return (
      (await db.syncCursor.get('singleton')) ?? {
        id: 'singleton' as const,
        cursor: 0,
        hydrated: false,
        snapshotResumeToken: null,
      }
    );
  }

  async setSyncCursor(patch: Partial<{
    cursor: number;
    hydrated: boolean;
    snapshotResumeToken: string | null;
    highWatermark: number;
  }>) {
    const db = getPosStoreDatabase();
    const current = await this.getSyncCursor();
    await db.syncCursor.put({ ...current, ...patch, id: 'singleton' });
  }

  async getOpenConflicts(): Promise<SyncConflictRow[]> {
    const db = getPosStoreDatabase();
    const all = await db.syncConflicts.toArray();
    return all.filter((c) => !c.resolved);
  }

  async storeNumberReservations(
    series: NumberSeries,
    start: number,
    end: number,
  ): Promise<void> {
    const db = getPosStoreDatabase();
    const now = new Date().toISOString();
    const rows = [];
    for (let value = start; value <= end; value += 1) {
      rows.push({
        id: `${series}:${value}`,
        series,
        value,
        status: 'reserved' as const,
        reserved_at: now,
      });
    }
    await db.numberReservations.bulkPut(rows);
  }
}

export const posStore = new PosStore();
