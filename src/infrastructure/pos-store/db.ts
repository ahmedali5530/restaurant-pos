import Dexie, { type Table } from 'dexie';
import type {
  CatalogRecord,
  ChildRecord,
  CouponRedemptionRecord,
  CustomerRecord,
  DomainOperation,
  NumberReservationRow,
  OrderCouponRecord,
  OrderDiscountRecord,
  OrderExtraRecord,
  OrderItemKitchenRecord,
  OrderItemRecord,
  OrderMergeRecord,
  OrderPaymentRecord,
  OrderPrintRecord,
  OrderRecord,
  OrderRefundRecord,
  OrderSplitRecord,
  OrderTaxRecord,
  OrderVoidRecord,
  SyncConflictRow,
  SyncCursorRow,
  SyncOutboxRow,
  TableLockRecord,
  TerminalIdentity,
} from './types.ts';
import { CHILD_TABLE_STORES, type ChildTableName } from './types.ts';

/** Dedicated IndexedDB — never reuse jotai or write-queue DB names. */
export const POS_STORE_DB_NAME = 'posr-terminal-posstore';

export class PosStoreDatabase extends Dexie {
  identity!: Table<TerminalIdentity & { id: 'singleton' }, string>;
  orders!: Table<OrderRecord, string>;
  orderItems!: Table<OrderItemRecord, string>;
  orderItemKitchens!: Table<OrderItemKitchenRecord, string>;
  orderPayments!: Table<OrderPaymentRecord, string>;
  orderVoids!: Table<OrderVoidRecord, string>;
  orderRefunds!: Table<OrderRefundRecord, string>;
  orderTaxes!: Table<OrderTaxRecord, string>;
  orderDiscounts!: Table<OrderDiscountRecord, string>;
  orderCoupons!: Table<OrderCouponRecord, string>;
  orderExtras!: Table<OrderExtraRecord, string>;
  couponRedemptions!: Table<CouponRedemptionRecord, string>;
  orderSplits!: Table<OrderSplitRecord, string>;
  orderMerges!: Table<OrderMergeRecord, string>;
  orderPrints!: Table<OrderPrintRecord, string>;
  customers!: Table<CustomerRecord, string>;
  tableLocks!: Table<TableLockRecord, string>;
  catalog!: Table<CatalogRecord, string>;
  domainOperations!: Table<DomainOperation, string>;
  syncOutbox!: Table<SyncOutboxRow, string>;
  syncCursor!: Table<SyncCursorRow, string>;
  syncConflicts!: Table<SyncConflictRow, string>;
  numberReservations!: Table<NumberReservationRow, string>;

  constructor(name = POS_STORE_DB_NAME) {
    super(name);
    this.version(1).stores({
      identity: 'id, terminalId',
      orders: 'id, status, table, owner_terminal_id, created_at, server_version',
      orderItems: 'id, order, item, created_at',
      orderItemKitchens: 'id, kitchen, order_item, status, created_at',
      catalog: 'id, table',
      domainOperations: 'operationId, terminalId, sequence, aggregateId, createdAt',
      syncOutbox: 'operationId, status, createdAt',
      syncCursor: 'id',
      syncConflicts: 'id, operationId, resolved, createdAt',
      numberReservations: 'id, series, status, value',
    });
    // v2: every order child table + customers + live table locks live locally so
    // pay/void/refund/split/merge/lock work during outages (ADR 0001).
    this.version(2).stores({
      orderPayments: 'id, order, created_at',
      orderVoids: 'id, order, created_at',
      orderRefunds: 'id, order, created_at',
      orderTaxes: 'id, order',
      orderDiscounts: 'id, order',
      orderCoupons: 'id, order',
      orderExtras: 'id, order',
      couponRedemptions: 'id, order, coupon',
      orderSplits: 'id, old_order',
      orderMerges: 'id, new_order',
      orderPrints: 'id, order',
      customers: 'id, phone, name',
      tableLocks: 'id, locked_by',
    });
    // v3: coupon redemption counters need coupon+user lookups offline.
    this.version(3).stores({
      couponRedemptions: 'id, order, coupon, user, [coupon+user]',
    });
  }

  /** Dexie store for a Surreal child table, or null when not mirrored. */
  childStore(table: string): Table<ChildRecord, string> | null {
    const store = (CHILD_TABLE_STORES as Record<string, string>)[table];
    if (!store) return null;
    return (this as any)[store] as Table<ChildRecord, string>;
  }

  /** All Dexie tables that mirror Surreal order children (for transactions). */
  childStores(): Table<ChildRecord, string>[] {
    return (Object.keys(CHILD_TABLE_STORES) as ChildTableName[]).map(
      (table) => this.childStore(table)!,
    );
  }
}

let dbSingleton: PosStoreDatabase | null = null;

export function getPosStoreDatabase(): PosStoreDatabase {
  if (!dbSingleton) {
    dbSingleton = new PosStoreDatabase();
  }
  return dbSingleton;
}

/** Test helper — replaces the singleton with an in-memory-named DB. */
export function resetPosStoreDatabaseForTests(name?: string): PosStoreDatabase {
  if (dbSingleton) {
    void dbSingleton.close();
  }
  dbSingleton = new PosStoreDatabase(name ?? `${POS_STORE_DB_NAME}-test-${crypto.randomUUID()}`);
  return dbSingleton;
}
