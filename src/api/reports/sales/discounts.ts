import {aggregateOrderDiscountBreakdown, getOrderDiscountTotal, getOrderSettlementFigures, orderHasDiscount} from "@/lib/order.ts";
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

export const getDiscountSummary = async (
  db: DbClient,
  options: DateRangeFilter & {billPercentThreshold?: number} = {},
) => {
  const billPercentThreshold = options.billPercentThreshold ?? 20;
  const orders = await fetchPaidOrders(db, {
    ...options,
    fetches: DISCOUNT_FETCHES,
  });

  const discountedOrders = orders.filter(orderHasDiscount);

  const byType = aggregateOrderDiscountBreakdown(discountedOrders, 'name').map(row => ({
    type: row.rateLabel !== '-' ? `${row.name} (${row.rateLabel})` : row.name,
    quantity: row.quantity,
    amount: row.total,
  }));

  const total = discountedOrders.reduce((sum, order) => sum + getOrderDiscountTotal(order), 0);

  const promotionalDetails: Array<{
    invoiceNumber?: number;
    discountName: string;
    appliedAmount: number;
    billTotal: number;
    discountPercentOfBill: number;
    reason?: string;
    reasonText?: string;
    applicationType?: string;
    exceededThreshold: boolean;
  }> = [];

  discountedOrders.forEach(order => {
    const billTotal = getOrderSettlementFigures(order).grandTotalDue;
    const activeLines = (order.order_discounts ?? []).filter(line => line && !line.removed_at);

    if (activeLines.length > 0) {
      activeLines.forEach(line => {
        const appliedAmount = Number(line.applied_amount ?? 0);
        const discountPercentOfBill = billTotal > 0
          ? (appliedAmount / billTotal) * 100
          : 0;
        const discountRef = line.discount;
        const discountName = line.name
          || (typeof discountRef === "object" && discountRef !== null && "name" in discountRef
            ? String((discountRef as {name?: string}).name)
            : typeof discountRef === "string" ? discountRef : "Discount");
        const reasonRef = line.reason;
        const reasonLabel = typeof reasonRef === "string"
          ? reasonRef
          : (typeof reasonRef === "object" && reasonRef !== null && "name" in reasonRef
            ? String((reasonRef as {name?: string}).name)
            : undefined);
        promotionalDetails.push({
          invoiceNumber: order.invoice_number,
          discountName,
          appliedAmount,
          billTotal,
          discountPercentOfBill,
          reason: reasonLabel,
          reasonText: line.reason_text,
          applicationType: line.application_type,
          exceededThreshold: discountPercentOfBill > billPercentThreshold,
        });
      });
      return;
    }

    const appliedAmount = getOrderDiscountTotal(order);
    const discountPercentOfBill = billTotal > 0 ? (appliedAmount / billTotal) * 100 : 0;
    promotionalDetails.push({
      invoiceNumber: order.invoice_number,
      discountName: order.discount?.name || "Custom discount",
      appliedAmount,
      billTotal,
      discountPercentOfBill,
      exceededThreshold: discountPercentOfBill > billPercentThreshold,
    });
  });

  const exceededThreshold = promotionalDetails.filter(row => row.exceededThreshold);

  return {
    orderCount: discountedOrders.length,
    total,
    billPercentThreshold,
    byType,
    promotionalDiscounts: promotionalDetails.slice(0, 50),
    exceededBillPercentThreshold: exceededThreshold.slice(0, 50),
    exceededCount: exceededThreshold.length,
    orders: discountedOrders.slice(0, 20).map(order => ({
      invoiceNumber: order.invoice_number,
      amount: getOrderDiscountTotal(order),
      createdAt: order.created_at,
    })),
  };
};
