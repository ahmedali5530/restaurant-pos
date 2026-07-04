import {aggregateOrderDiscountBreakdown, getOrderDiscountTotal, orderHasDiscount} from "@/lib/order.ts";
import {fetchPaidOrders, SALES_SUMMARY_FETCHES} from "@/api/reports/sales/fetch.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";

const DISCOUNT_FETCHES = [
  ...SALES_SUMMARY_FETCHES,
  "order_discounts",
  "order_discounts.discount",
  "cashier",
  "user",
];

export {getOrderDiscountTotal, orderHasDiscount};

export const getDiscountSummary = async (db: DbClient, options: DateRangeFilter) => {
  const orders = await fetchPaidOrders(db, {
    ...options,
    fetches: DISCOUNT_FETCHES,
  });

  const discountedOrders = orders.filter(orderHasDiscount);

  const byType = aggregateOrderDiscountBreakdown(discountedOrders, 'name').map(row => ({
    type: row.name,
    quantity: row.quantity,
    amount: row.total,
  }));

  const total = discountedOrders.reduce((sum, order) => sum + getOrderDiscountTotal(order), 0);

  return {
    orderCount: discountedOrders.length,
    total,
    byType,
    orders: discountedOrders.slice(0, 20).map(order => ({
      invoiceNumber: order.invoice_number,
      amount: getOrderDiscountTotal(order),
      createdAt: order.created_at,
    })),
  };
};
