import { Tables } from "@/api/db/tables.ts";
import {
  AUTO_CHECK_CLOSE_KEY,
  AutoCheckCloseSettings,
  DEFAULT_AUTO_CHECK_CLOSE,
} from "@/api/model/auto_check_close.ts";
import { Order, ORDER_FETCHES, OrderStatus } from "@/api/model/order.ts";
import { Setting } from "@/api/model/setting.ts";
import { calculateOrderGrandTotal, calculateOrderTotal } from "@/lib/cart.ts";
import { getOrderFilteredItems } from "@/lib/order.ts";
import {
  AutoCloseCycleState,
  ClosingCycleWindow,
  getAutoCloseCycleStateFromDb,
} from "@/lib/closing-cycle.ts";
import { dispatchPrint } from "@/lib/print.service.ts";
import { PRINT_TYPE } from "@/lib/print.registry.tsx";
import { requestBillPrint } from "@/lib/order-print.ts";
import { toSurrealDateTime } from "@/lib/datetime.ts";
import { IntegrationManager } from "@/integrations/core/integration-manager.ts";
import {
  fiscalShouldBlockBeforePaid,
  getFiscalQrcodesForOrderPrint,
  loadOrderForFiscal,
  runFiscalSettlementForOrder,
} from "@/integrations/providers/fiscal/settlement.ts";
import { publishSaleCompleted } from "@/integrations/accounting/events/publish.ts";
import { publishInvoiceCreated } from "@/integrations/events/publish/payments.ts";
import { posStore } from "@/infrastructure/pos-store/pos-store.ts";
import { terminalSyncService } from "@/infrastructure/sync/sync-service.ts";

type DBLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
  create: (table: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (id: unknown, data: Record<string, unknown>) => Promise<unknown>;
  delete: (id: unknown) => Promise<unknown>;
};

export const WARNING_TOAST_ID = 'auto-check-close-warning';

export function hasPaymentTypeConfigured(paymentTypeId: unknown): boolean {
  if (paymentTypeId === null || paymentTypeId === undefined) {
    return false;
  }

  if (typeof paymentTypeId === 'string') {
    return paymentTypeId.trim().length > 0;
  }

  if (typeof paymentTypeId === 'object') {
    const record = paymentTypeId as { id?: unknown; tb?: unknown };
    return Boolean(record.id ?? record.tb);
  }

  return true;
}

export function isDeliveryOrder(order: Order): boolean {
  const delivery = order.delivery;
  if (delivery === null || delivery === undefined) {
    return false;
  }

  if (typeof delivery === 'object') {
    return Object.keys(delivery as Record<string, unknown>).length > 0;
  }

  return true;
}

export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function computeOrderGrandTotalFromOrder(order: Order): number {
  const itemsTotal = calculateOrderTotal(order);
  const extrasTotal = (order.extras ?? []).reduce(
    (sum, extra) => sum + Number(extra?.value || 0),
    0
  );
  const couponAmount = order.coupon?.discount ?? 0;

  return calculateOrderGrandTotal({
    itemsTotal,
    extrasTotal,
    taxAmount: order.tax_amount ?? 0,
    discountAmount: order.discount_amount ?? 0,
    serviceChargeAmount: order.service_charge_amount ?? 0,
    couponAmount,
    tipAmount: order.tip_amount ?? 0,
  });
}

export async function loadAutoCheckCloseSettings(db: DBLike): Promise<{
  setting: Setting | null;
  values: AutoCheckCloseSettings;
}> {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
    { key: AUTO_CHECK_CLOSE_KEY }
  ) as [Setting[] | undefined];
  const setting = rows?.[0] ?? null;
  const values = {
    ...DEFAULT_AUTO_CHECK_CLOSE,
    ...(setting?.values as AutoCheckCloseSettings | undefined),
  };
  return { setting, values };
}

export async function markAutoCheckCloseCycle(
  db: DBLike,
  setting: Setting | null,
  cycleKey: string
): Promise<void> {
  const existing = {
    ...DEFAULT_AUTO_CHECK_CLOSE,
    ...(setting?.values as AutoCheckCloseSettings | undefined),
  };
  const payload: AutoCheckCloseSettings = {
    ...existing,
    last_closed_cycle: cycleKey,
  };

  if (setting?.id) {
    await db.merge(setting.id, { values: payload });
  } else {
    await db.create(Tables.settings, {
      key: AUTO_CHECK_CLOSE_KEY,
      is_global: true,
      values: payload,
    });
  }
}

async function fetchOpenOrders(db: DBLike, window: ClosingCycleWindow): Promise<Order[]> {
  const fetchClause = ORDER_FETCHES.join(', ');

  const queryOrders = async (includeWindow: boolean) => {
    const [rows] = await db.query(
      includeWindow
        ? `
          SELECT * FROM ${Tables.orders}
          WHERE status = $status
            AND created_at >= $cycleStart
            AND created_at <= $cycleEnd
          FETCH ${fetchClause}
        `
        : `
          SELECT * FROM ${Tables.orders}
          WHERE status = $status
          FETCH ${fetchClause}
        `,
      includeWindow
        ? {
            status: OrderStatus['In Progress'],
            cycleStart: toSurrealDateTime(window.date_from),
            cycleEnd: toSurrealDateTime(window.date_to),
          }
        : {
            status: OrderStatus['In Progress'],
          }
    ) as [Order[] | undefined];

    const orders = Array.isArray(rows) ? rows : [];
    return orders.filter((order) => !isDeliveryOrder(order));
  };

  const cycleOrders = await queryOrders(true);
  if (cycleOrders.length > 0) {
    return cycleOrders;
  }

  return queryOrders(false);
}

async function loadOrderForClose(db: DBLike, orderId: unknown): Promise<Order | null> {
  const fetchClause = ORDER_FETCHES.join(', ');
  const [order] = await db.query(
    `SELECT * FROM ONLY ${orderId} FETCH ${fetchClause}`
  ) as unknown as [Order | undefined];

  return order ?? null;
}

const recordIdString = (value: unknown): string => {
  if (value && typeof value === 'object' && 'tb' in (value as object) && 'id' in (value as object)) {
    const rid = value as { tb: unknown; id: unknown };
    return `${String(rid.tb)}:${String(rid.id)}`;
  }
  return String(value);
};

/**
 * Settle one check through the PosStore (Dexie → outbox → Surreal): one
 * "Auto close" payment for the grand total, `Paid` status and table release.
 */
async function settleOrder(
  order: Order,
  paymentTypeId: unknown,
  grandTotal: number,
  userId?: string
): Promise<void> {
  const orderId = String(order.id);
  await posStore.settleOrder({
    orderId,
    payments: [
      {
        paymentTypeId: recordIdString(paymentTypeId),
        amount: grandTotal,
        payable: grandTotal,
        comments: 'Auto close',
      },
    ],
    cashierId: userId ? recordIdString(userId) : null,
    notes: order.notes ?? '',
    seed: { order, items: order.items },
  });

  if (order.table?.id) {
    await posStore.unlockTable(String(order.table.id)).catch(() => undefined);
  }

  // Drain the outbox so the fiscal / accounting reads below see the settled order.
  await terminalSyncService.synchronize().catch(() => undefined);
}

async function printFinalBill(
  db: DBLike,
  orderId: string,
  userId?: string
): Promise<void> {
  const [order] = await db.query(
    `SELECT * FROM ONLY ${orderId} FETCH items, items.item, item.item.modifiers, table, user, order_type, customer, discount, tax, payments, payments.payment_type, extras, extras.order_extras`
  ) as unknown as [Order | undefined];

  if (order) {
    const qrcodes = await getFiscalQrcodesForOrderPrint(db, orderId);
    await requestBillPrint({
      db,
      orderId: String(orderId),
      printType: 'final',
      printModule: 'orders.print_final',
      description: 'Print final bill',
      userId,
      skipIfOverLimit: true,
      doPrint: () => dispatchPrint(
        db,
        PRINT_TYPE.final_bill,
        { order, qrcodes, qrcode: qrcodes[0]?.value },
        { userId }
      ),
    });
  }
}

export async function closeOpenChecks(options: {
  db: DBLike;
  paymentTypeId: unknown;
  printOnClose: boolean;
  userId?: string;
  window: ClosingCycleWindow;
  integrationManager?: IntegrationManager;
}): Promise<{ closed: number; failed: number; candidates: number; skipped: number }> {
  const { db, paymentTypeId, printOnClose, userId, window, integrationManager } = options;

  if (!hasPaymentTypeConfigured(paymentTypeId)) {
    return { closed: 0, failed: 0, candidates: 0, skipped: 0 };
  }

  const orders = await fetchOpenOrders(db, window);
  let closed = 0;
  let failed = 0;
  let skipped = 0;

  for (const order of orders) {
    try {
      const fullOrder = await loadOrderForClose(db, order.id);
      if (!fullOrder || fullOrder.status !== OrderStatus['In Progress']) {
        skipped += 1;
        continue;
      }

      const grandTotal = computeOrderGrandTotalFromOrder(fullOrder);
      const hasItems = getOrderFilteredItems(fullOrder).length > 0;
      if (!hasItems) {
        skipped += 1;
        continue;
      }

      const paymentAmount = Math.max(grandTotal, 0);

      if (integrationManager) {
        const blockBeforePaid = await fiscalShouldBlockBeforePaid(integrationManager, db);
        if (blockBeforePaid) {
          const fiscalResult = await runFiscalSettlementForOrder(
            integrationManager,
            db,
            fullOrder
          );
          if (fiscalResult.blocked) {
            throw new Error(fiscalResult.blockedError ?? 'Fiscal submission failed');
          }
        }
      }

      await settleOrder(fullOrder, paymentTypeId, paymentAmount, userId);

      if (integrationManager) {
        const blockBeforePaid = await fiscalShouldBlockBeforePaid(integrationManager, db);
        if (!blockBeforePaid) {
          const settled = await loadOrderForFiscal(db, String(fullOrder.id));
          if (settled) {
            await runFiscalSettlementForOrder(integrationManager, db, settled);
          }
        }

        const saleOrder = await loadOrderForFiscal(db, String(fullOrder.id));
        if (saleOrder) {
          try {
            await publishSaleCompleted(integrationManager, saleOrder);
            await publishInvoiceCreated(integrationManager, {
              orderId: String(saleOrder.id),
              invoiceNumber: saleOrder.invoice_number,
              completedAt: new Date().toISOString(),
            });
          } catch (publishError) {
            console.warn('Failed publishing SaleCompleted event', publishError);
          }
        }
      }

      if (printOnClose) {
        await printFinalBill(db, fullOrder.id.toString(), userId);
      }

      closed += 1;
    } catch (error) {
      console.error('Auto check close failed for order', order.id, error);
      failed += 1;
    }
  }

  return { closed, failed, candidates: orders.length, skipped };
}

export async function countOpenChecksForWindow(
  db: DBLike,
  window: ClosingCycleWindow
): Promise<number> {
  const orders = await fetchOpenOrders(db, window);
  return orders.length;
}

export const getAutoCloseState = async (
  db: DBLike,
  now: Date = new Date()
): Promise<{config: {enabled: boolean}; state: AutoCloseCycleState}> => {
  return getAutoCloseCycleStateFromDb(db, now);
};
