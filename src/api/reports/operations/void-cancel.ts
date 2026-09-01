import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import {OrderStatus} from "@/api/model/order.ts";
import {getOrders} from "@/api/reports/operations/orders.ts";
import {getVoids} from "@/api/reports/sales/extended.ts";
import {getOrderCompAmount, isOrderComp} from "@/api/reports/sales/server-analytics.ts";
import {fetchPaidOrders} from "@/api/reports/sales/fetch.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {safeNumber} from "@/lib/utils.ts";

export const getVoidAndCancelSummary = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number} = {},
) => {
  const limit = options.limit ?? 50;

  const [voidsData, cancelledData, paidOrders] = await Promise.all([
    getVoids(db, {...options, limit: 500}),
    getOrders(db, {
      ...options,
      statuses: [OrderStatus.Cancelled],
      limit: 200,
    }),
    fetchPaidOrders(db, {
      ...options,
      fetches: ["items", "items.item", "discount", "order_discounts", "order_discounts.discount"],
    }),
  ]);

  const compsByReason = new Map<string, {count: number; amount: number}>();
  let compTotal = 0;
  let compCount = 0;

  paidOrders.forEach(order => {
    if (!isOrderComp(order)) {
      return;
    }
    const amount = getOrderCompAmount(order);
    compTotal += amount;
    compCount += 1;
    const reason = "Complimentary (100% discount)";
    const existing = compsByReason.get(reason) || {count: 0, amount: 0};
    existing.count += 1;
    existing.amount += amount;
    compsByReason.set(reason, existing);
  });

  const voidReasons = voidsData.byReason.map(row => ({
    reason: row.reason,
    count: row.count,
    amount: row.amount,
    type: "void" as const,
  }));

  const cancelReasons = new Map<string, {count: number}>();
  cancelledData.orders.forEach(order => {
    const reason = order.status || "Cancelled";
    const existing = cancelReasons.get(reason) || {count: 0};
    existing.count += 1;
    cancelReasons.set(reason, existing);
  });

  return {
    voidSummary: {
      totalCount: voidsData.totalCount,
      totalAmount: voidsData.totalAmount,
      byReason: voidReasons.slice(0, limit),
    },
    cancelledOrders: {
      totalCount: cancelledData.totalCount,
      orders: cancelledData.orders.slice(0, limit).map(order => ({
        invoiceNumber: order.invoiceNumber,
        status: order.status,
        serverName: order.server,
        createdAt: order.createdAt,
      })),
    },
    comps: {
      totalCount: compCount,
      totalAmount: safeNumber(compTotal),
      byReason: Array.from(compsByReason.entries()).map(([reason, stats]) => ({
        reason,
        ...stats,
        type: "comp" as const,
      })),
    },
    combinedReasons: [
      ...voidReasons,
      ...Array.from(cancelReasons.entries()).map(([reason, stats]) => ({
        reason,
        count: stats.count,
        amount: 0,
        type: "cancellation" as const,
      })),
      ...Array.from(compsByReason.entries()).map(([reason, stats]) => ({
        reason,
        count: stats.count,
        amount: stats.amount,
        type: "comp" as const,
      })),
    ].sort((a, b) => b.count - a.count).slice(0, limit),
  };
};
