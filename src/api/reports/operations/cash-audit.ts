import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {getOrderPaymentTotals} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";

const isCashPayment = (type?: string, name?: string): boolean => {
  const normalizedType = type?.toLowerCase()?.trim() ?? "";
  const normalizedName = name?.toLowerCase()?.trim() ?? "";
  return normalizedType === "cash" || normalizedName === "cash";
};

export const getCashSettlementAudit = async (
  db: DbClient,
  options: DateRangeFilter & {minutesBeforeClose?: number; limit?: number} = {},
) => {
  const windowMinutes = options.minutesBeforeClose ?? 30;
  const limit = options.limit ?? 50;
  const {conditions, params} = buildCreatedAtDateConditions(options);
  const orderConditions = ["status = 'Paid'", ...conditions];

  const orders = unwrapQueryResult<Order>(
    await db.query(
      `
        SELECT * FROM ${Tables.orders}
        WHERE ${orderConditions.join(" AND ")}
        FETCH payments, payments.payment_type, cashier, user, items, items.item
      `,
      params,
    ),
  );

  const cashOrders = orders.filter(order =>
    (order.payments ?? []).some(payment =>
      isCashPayment(payment.payment_type?.type, payment.payment_type?.name),
    ),
  );

  const orderIds = cashOrders.map(order => recordIdToString(order.id)).filter(Boolean);
  const trackingEntries = orderIds.length > 0
    ? unwrapQueryResult<{
        module?: string;
        page?: string;
        user_name?: string;
        created_at?: unknown;
        payload?: Record<string, unknown>;
      }>(
        await db.query(
          `
            SELECT * FROM ${Tables.tracking}
            WHERE created_at >= $startDate AND created_at <= $endDate
            ORDER BY created_at DESC
            LIMIT 500
          `,
          params,
        ),
      )
    : [];

  const paymentModules = new Set([
    "Update order payment details",
    "Complete order payment",
    "Delete order item",
    "Void order item",
  ]);

  const modifications: Array<{
    orderId: string;
    invoiceNumber?: number;
    cashierName?: string;
    modificationType: string;
    module?: string;
    minutesBeforeClose?: number;
    createdAt?: unknown;
    payload?: Record<string, unknown>;
  }> = [];

  cashOrders.forEach(order => {
    const orderId = recordIdToString(order.id);
    const completedAt = order.completed_at
      ? toJsDate(order.completed_at as Parameters<typeof toJsDate>[0]).getTime()
      : null;

    const deletedItems = (order.items ?? []).filter(item => item?.deleted_at !== undefined);
    if (deletedItems.length > 0 && completedAt) {
      deletedItems.forEach(item => {
        const deletedAt = item.deleted_at
          ? toJsDate(item.deleted_at as Parameters<typeof toJsDate>[0]).getTime()
          : null;
        if (deletedAt === null) {
          return;
        }
        const minutesBefore = Math.floor((completedAt - deletedAt) / 60000);
        if (minutesBefore >= 0 && minutesBefore <= windowMinutes) {
          modifications.push({
            orderId,
            invoiceNumber: order.invoice_number,
            cashierName: (order.cashier as {first_name?: string; last_name?: string} | undefined)
              ? `${(order.cashier as {first_name?: string}).first_name ?? ""} ${(order.cashier as {last_name?: string}).last_name ?? ""}`.trim()
              : undefined,
            modificationType: "item_removed",
            minutesBeforeClose: minutesBefore,
            payload: {itemName: item.item?.name},
          });
        }
      });
    }

    trackingEntries.forEach(entry => {
      const payload = entry.payload ?? {};
      const payloadOrderId = recordIdToString(payload.order_id ?? payload.orderId ?? payload.order);
      if (payloadOrderId !== orderId && !paymentModules.has(entry.module ?? "")) {
        return;
      }
      if (!paymentModules.has(entry.module ?? "")) {
        return;
      }
      const createdAt = entry.created_at
        ? toJsDate(entry.created_at as Parameters<typeof toJsDate>[0]).getTime()
        : null;
      if (completedAt && createdAt) {
        const minutesBefore = Math.floor((completedAt - createdAt) / 60000);
        if (minutesBefore < 0 || minutesBefore > windowMinutes) {
          return;
        }
        modifications.push({
          orderId,
          invoiceNumber: order.invoice_number,
          modificationType: "payment_or_item_change",
          module: entry.module,
          minutesBeforeClose: minutesBefore,
          createdAt: entry.created_at,
          payload,
        });
      }
    });
  });

  return {
    windowMinutes,
    cashOrderCount: cashOrders.length,
    flaggedOrderCount: new Set(modifications.map(m => m.orderId)).size,
    cashOrders: cashOrders.slice(0, limit).map(order => {
      const paymentTotals = getOrderPaymentTotals(order);
      return {
        orderId: recordIdToString(order.id),
        invoiceNumber: order.invoice_number,
        cashAmount: paymentTotals.cashAmount,
        amountCollected: paymentTotals.amountCollected,
        completedAt: order.completed_at,
      };
    }),
    modifications: modifications.slice(0, limit),
  };
};
