import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import {ORDER_FETCHES, ORDER_PAYMENT_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getOrderFigures} from "@/api/reports/sales/aggregate.ts";
import {calculateOrderGrandTotal, calculateOrderTotal} from "@/lib/cart.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";
import {DateTime} from "luxon";

const STATUS_ALIASES: Record<string, string> = {
  "in progress": OrderStatus["In Progress"],
  "in_progress": OrderStatus["In Progress"],
  progress: OrderStatus["In Progress"],
  open: OrderStatus["In Progress"],
  paid: OrderStatus.Paid,
  cancelled: OrderStatus.Cancelled,
  canceled: OrderStatus.Cancelled,
  spilt: OrderStatus.Spilt,
  split: OrderStatus.Spilt,
  merged: OrderStatus.Merged,
  merge: OrderStatus.Merged,
  refunded: OrderStatus.Refunded,
  refund: OrderStatus.Refunded,
  pending: OrderStatus.Pending,
};

export const normalizeOrderStatus = (status: string): string => {
  const trimmed = status.trim();
  const alias = STATUS_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  const match = Object.values(OrderStatus).find(
    value => value.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
};

export interface GetOrdersOptions extends DateRangeFilter {
  statuses?: string[];
  limit?: number;
  /** Only orders with a delivery payload (online / delivery channel). */
  deliveryOnly?: boolean;
}

const DELIVERY_ORDER_CONDITION = "delivery != NONE AND delivery != {} AND delivery != []";

const resolveOrderFetches = (deliveryOnly?: boolean, statuses?: string[]) => {
  const openStatuses = new Set<string>([OrderStatus.Pending, OrderStatus["In Progress"]]);
  const needsFullFetch = deliveryOnly
    || (statuses?.some(status => openStatuses.has(normalizeOrderStatus(status))) ?? false);
  const base = needsFullFetch ? ORDER_FETCHES : ORDER_PAYMENT_FETCHES;
  return [...base, "floor"];
};

const formatOrderRow = (order: Order) => {
  const figures = getOrderFigures(order);
  const itemsTotal = calculateOrderTotal(order);
  const extrasTotal = (order.extras ?? []).reduce((sum, extra) => sum + safeNumber(extra.value), 0);
  const displayTotal = calculateOrderGrandTotal({
    itemsTotal,
    extrasTotal,
    taxAmount: safeNumber(order.tax_amount),
    discountAmount: safeNumber(order.discount_amount),
    serviceChargeAmount: safeNumber(order.service_charge_amount),
    tipAmount: safeNumber(order.tip_amount),
  });
  const user = order.user as {first_name?: string; last_name?: string} | undefined;
  const customer = order.customer as {name?: string; phone?: string | number} | undefined;
  const delivery = order.delivery as {
    state?: string;
    address?: string;
    place?: string;
    rider?: {first_name?: string; last_name?: string};
  } | undefined;
  const table = order.table as {name?: string; number?: string | number} | undefined;
  const orderType = order.order_type as {name?: string} | undefined;
  const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);

  return {
    orderId: recordToString(order.id),
    invoiceNumber: order.invoice_number,
    status: order.status,
    createdAt: DateTime.fromJSDate(jsDate).toFormat(import.meta.env.VITE_DATE_TIME_FORMAT as string),
    server: user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() : undefined,
    customer: customer?.name,
    customerPhone: customer?.phone != null ? String(customer.phone) : undefined,
    deliveryState: delivery?.state,
    deliveryAddress: delivery?.place ?? delivery?.address,
    rider: delivery?.rider
      ? `${delivery.rider.first_name ?? ""} ${delivery.rider.last_name ?? ""}`.trim()
      : undefined,
    table: table?.name ?? (table?.number != null ? String(table.number) : undefined),
    orderType: orderType?.name,
    itemCount: getOrderFilteredItems(order).length,
    covers: safeNumber(order.covers),
    grandTotal: displayTotal,
    netSales: figures.netSales,
  };
};

export const getOrders = async (db: DbClient, options: GetOrdersOptions = {}) => {
  const {limit = 50, statuses, deliveryOnly = false, ...dateRange} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (deliveryOnly) {
    conditions.push(DELIVERY_ORDER_CONDITION);
  }

  if (statuses?.length) {
    const normalized = statuses.map(normalizeOrderStatus);
    const parts = normalized.map((status, index) => {
      const param = `status${index}`;
      params[param] = status;
      return `status = $${param}`;
    });
    conditions.push(`(${parts.join(" OR ")})`);
  }

  const dateFilter = buildCreatedAtDateConditions(dateRange);
  conditions.push(...dateFilter.conditions);
  Object.assign(params, dateFilter.params);

  const query = `
    SELECT * FROM ${Tables.orders}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 200)}
    FETCH ${resolveOrderFetches(deliveryOnly, statuses).join(", ")}
  `;

  const orders = unwrapQueryResult<Order>(await db.query(query, params));
  const rows = orders.map(formatOrderRow);

  const byStatus = new Map<string, number>();
  orders.forEach(order => {
    const status = order.status ?? "Unknown";
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  });

  const overallGrandTotal = rows.reduce((sum, row) => sum + safeNumber(row.grandTotal), 0);

  return {
    totalCount: orders.length,
    overallGrandTotal,
    byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({status, count})),
    orders: rows,
  };
};

export const listOrderStatuses = () => Object.values(OrderStatus);
