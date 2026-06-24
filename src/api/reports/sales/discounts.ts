import type {Order} from "@/api/model/order.ts";
import {getOrderFigures} from "@/api/reports/sales/aggregate.ts";
import {fetchPaidOrders, SALES_SUMMARY_FETCHES} from "@/api/reports/sales/fetch.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {safeNumber} from "@/lib/utils.ts";

const DISCOUNT_FETCHES = [
  ...SALES_SUMMARY_FETCHES,
  "order_discounts",
  "order_discounts.discount",
  "cashier",
  "user",
];

export const getOrderDiscountTotal = (order: Order) => getOrderFigures(order).discounts;

export const orderHasDiscount = (order: Order) => getOrderDiscountTotal(order) > 0;

export const getDiscountSummary = async (db: DbClient, options: DateRangeFilter) => {
  const orders = await fetchPaidOrders(db, {
    ...options,
    fetches: DISCOUNT_FETCHES,
  });

  const discountedOrders = orders.filter(orderHasDiscount);

  const byType = new Map<string, {count: number; amount: number}>();

  discountedOrders.forEach(order => {
    const activeLines = (order.order_discounts ?? []).filter(line => !line.removed_at);

    if (activeLines.length > 0) {
      activeLines.forEach(line => {
        const type = line.name || order.discount?.name || "Discount";
        const amount = safeNumber(line.applied_amount);
        const current = byType.get(type) ?? {count: 0, amount: 0};
        current.count += 1;
        current.amount += amount;
        byType.set(type, current);
      });
      return;
    }

    const type =
      order.discount?.name
      || (typeof order.discount === "string" ? order.discount : null)
      || "Custom discount";
    const amount = getOrderDiscountTotal(order);
    const current = byType.get(type) ?? {count: 0, amount: 0};
    current.count += 1;
    current.amount += amount;
    byType.set(type, current);
  });

  const total = discountedOrders.reduce((sum, order) => sum + getOrderDiscountTotal(order), 0);

  return {
    orderCount: discountedOrders.length,
    total,
    byType: Array.from(byType.entries())
      .map(([type, stats]) => ({type, quantity: stats.count, amount: stats.amount}))
      .sort((a, b) => b.amount - a.amount),
    orders: discountedOrders.slice(0, 20).map(order => ({
      invoiceNumber: order.invoice_number,
      amount: getOrderDiscountTotal(order),
      createdAt: order.created_at,
    })),
  };
};
