import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";
import {getDayPartLabel} from "@/utils/dayParts";
import {toJsDate} from "@/lib/datetime.ts";
import {DateTime} from "luxon";

const getVoidItems = (voidItem: OrderVoid) => (voidItem.items ?? []).filter(Boolean);

const getVoidLineAmount = (voidItem: OrderVoid, item: unknown) => {
  const quantity = safeNumber(voidItem.quantity ?? 1);
  return safeNumber(
    calculateOrderItemPrice({
      ...(item as object ?? {}),
      quantity,
    } as Parameters<typeof calculateOrderItemPrice>[0]),
  );
};

export const getVoids = async (db: DbClient, options: DateRangeFilter & {limit?: number}) => {
  const {limit = 50, ...dateRange} = options;
  const {conditions, params} = buildCreatedAtDateConditions(dateRange);

  const query = `
    SELECT * FROM ${Tables.order_voids}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY created_at ASC
    FETCH deleted_by, order, order.cashier, items, items.item
  `;

  const voids = unwrapQueryResult<OrderVoid>(await db.query(query, params));

  const byReason = new Map<string, {count: number; quantity: number; amount: number}>();
  const entries = voids.slice(0, limit).map(voidItem => {
    const voidItems = getVoidItems(voidItem);
    const amount = voidItems.reduce((sum, item) => sum + getVoidLineAmount(voidItem, item), 0);
    const reason = voidItem.reason || "Unknown";
    const existing = byReason.get(reason) || {count: 0, quantity: 0, amount: 0};
    existing.count += 1;
    existing.quantity += safeNumber(voidItem.quantity ?? 1) * voidItems.length;
    existing.amount += amount;
    byReason.set(reason, existing);

    return {
      reason,
      amount,
      quantity: safeNumber(voidItem.quantity ?? 1),
      manager: voidItem.deleted_by
        ? `${(voidItem.deleted_by as {first_name?: string; last_name?: string})?.first_name ?? ""} ${(voidItem.deleted_by as {first_name?: string; last_name?: string})?.last_name ?? ""}`.trim()
        : undefined,
      items: voidItems.map(item => (item as {item?: {name?: string}})?.item?.name).filter(Boolean),
    };
  });

  return {
    totalCount: voids.length,
    totalAmount: voids.reduce((sum, voidItem) => {
      return sum + getVoidItems(voidItem).reduce((s, item) => s + getVoidLineAmount(voidItem, item), 0);
    }, 0),
    byReason: Array.from(byReason.entries()).map(([reason, stats]) => ({reason, ...stats})),
    entries: entries.slice(0, limit),
  };
};

export const getTips = async (
  db: DbClient,
  options: DateRangeFilter & {shiftId?: string},
) => {
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

  if (options.startDate) {
    conditions.push(`time::format(from_at, "${dbFormat}") >= $startDate`);
    params.startDate = options.startDate;
  }
  if (options.endDate) {
    conditions.push(`time::format(from_at, "${dbFormat}") <= $endDate`);
    params.endDate = options.endDate;
  }
  if (options.shiftId) {
    conditions.push("shift = $shiftId");
    params.shiftId = options.shiftId;
  }

  const query = `
    SELECT * FROM ${Tables.tip_distributions}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    FETCH shift, users, users.user
  `;

  const distributions = unwrapQueryResult<{
    total_tips?: number;
    users?: Array<{user?: {first_name?: string; last_name?: string}; amount?: number}>;
  }>(await db.query(query, params));

  const tipsByUser = new Map<string, number>();
  distributions.forEach(distribution => {
    (distribution.users || []).forEach(share => {
      const user = share?.user;
      const name = user
        ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"
        : "Unknown";
      tipsByUser.set(name, (tipsByUser.get(name) || 0) + safeNumber(share?.amount));
    });
  });

  return {
    totalTips: distributions.reduce((sum, d) => sum + safeNumber(d.total_tips), 0),
    distributionCount: distributions.length,
    tipsByUser: Array.from(tipsByUser.entries())
      .map(([name, amount]) => ({name, amount}))
      .sort((a, b) => b.amount - a.amount),
  };
};

type MetricKey = "discount_amount" | "tax_amount" | "coupon_discount";

const getMetricAmount = (order: Order, metric: MetricKey) => {
  if (metric === "coupon_discount") {
    return safeNumber(order.coupon?.discount);
  }
  return safeNumber((order as unknown as Record<string, unknown>)?.[metric]);
};

export const getOrderFinanceSummary = async (
  db: DbClient,
  options: DateRangeFilter & {metric: MetricKey},
) => {
  const conditions = ["status = 'Paid'"];
  const params: Record<string, string> = {};
  const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(options);
  conditions.push(...dateConditions);
  Object.assign(params, dateParams);

  if (options.metric === "coupon_discount") {
    conditions.push("coupon != NONE");
  } else {
    conditions.push(`${options.metric} > 0`);
  }

  const query = `
    SELECT * FROM ${Tables.orders}
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 200
    FETCH user, cashier, coupon, tax, discount
  `;

  const orders = unwrapQueryResult<Order>(await db.query(query, params));
  const total = orders.reduce((sum, order) => sum + getMetricAmount(order, options.metric), 0);

  return {
    orderCount: orders.length,
    total,
    topOrders: orders.slice(0, 20).map(order => ({
      invoiceNumber: order.invoice_number,
      amount: getMetricAmount(order, options.metric),
      createdAt: order.created_at,
    })),
  };
};

export const getServerSales = async (db: DbClient, options: DateRangeFilter & {limit?: number}) => {
  const {limit = 20, ...dateRange} = options;
  const conditions = ["status = 'Paid'"];
  const params: Record<string, string> = {};
  const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(dateRange);
  conditions.push(...dateConditions);
  Object.assign(params, dateParams);

  const query = `
    SELECT * FROM ${Tables.orders}
    WHERE ${conditions.join(" AND ")}
    FETCH user, items, items.item, order_type
  `;

  const orders = unwrapQueryResult<Order>(await db.query(query, params));
  const byServer = new Map<string, {userName: string; netSales: number; checks: number; guests: number}>();

  orders.forEach(order => {
    const user = order.user as {id?: unknown; first_name?: string; last_name?: string} | undefined;
    const userId = recordToString(user?.id ?? user);
    const userName = user
      ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unknown"
      : "Unknown";

    const paymentTotals = getOrderPaymentTotals(order);
    const netSales = safeNumber(
      paymentTotals.amountCollected - safeNumber(order.service_charge_amount) - safeNumber(order.tax_amount),
    );

    const existing = byServer.get(userId) || {userName, netSales: 0, checks: 0, guests: 0};
    existing.netSales += netSales;
    existing.checks += 1;
    existing.guests += safeNumber(order.covers ?? 1);
    byServer.set(userId, existing);
  });

  return {
    servers: Array.from(byServer.values())
      .sort((a, b) => b.netSales - a.netSales)
      .slice(0, limit),
  };
};

export const getWeeklySales = async (db: DbClient, options: DateRangeFilter) => {
  const conditions = ["status = 'Paid'"];
  const params: Record<string, string> = {};
  const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(options);
  conditions.push(...dateConditions);
  Object.assign(params, dateParams);

  const query = `
    SELECT * FROM ${Tables.orders}
    WHERE ${conditions.join(" AND ")}
    FETCH payments
  `;

  const orders = unwrapQueryResult<Order>(await db.query(query, params));
  const byDay = new Map<string, {netSales: number; orderCount: number}>();

  orders.forEach(order => {
    const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);
    const dayKey = DateTime.fromJSDate(jsDate).toISODate() ?? "unknown";
    const paymentTotals = getOrderPaymentTotals(order);
    const netSales = safeNumber(
      paymentTotals.amountCollected - safeNumber(order.service_charge_amount) - safeNumber(order.tax_amount),
    );
    const existing = byDay.get(dayKey) || {netSales: 0, orderCount: 0};
    existing.netSales += netSales;
    existing.orderCount += 1;
    byDay.set(dayKey, existing);
  });

  return {
    days: Array.from(byDay.entries())
      .map(([date, stats]) => ({date, ...stats}))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};

export const getHourlyProductSales = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number},
) => {
  const {limit = 20, ...dateRange} = options;
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(dateRange);
  conditions.push(...dateConditions);
  Object.assign(params, dateParams);

  const query = `
    SELECT * FROM ${Tables.orders}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    FETCH items, items.item
  `;

  const orders = unwrapQueryResult<Order>(await db.query(query, params));
  const byItem = new Map<string, {name: string; quantity: number; revenue: number}>();

  orders.forEach(order => {
    const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);
    const hour = DateTime.fromJSDate(jsDate).hour;

    getOrderFilteredItems(order).forEach(item => {
      const dishId = recordToString((item.item as {id?: unknown})?.id ?? item.item);
      const name = (item.item as {name?: string})?.name ?? "Unknown";
      const key = `${dishId}-${hour}`;
      const revenue = safeNumber(calculateOrderItemPrice(item));
      const existing = byItem.get(key) || {name: `${name} (hour ${hour})`, quantity: 0, revenue: 0};
      existing.quantity += safeNumber(item.quantity);
      existing.revenue += revenue;
      byItem.set(key, existing);
    });
  });

  return {
    items: Array.from(byItem.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit),
  };
};

export const listStaff = async (db: DbClient, options: {search?: string; limit?: number} = {}) => {
  const limit = options.limit ?? 50;
  const query = `
    SELECT id, first_name, last_name FROM ${Tables.users}
    WHERE deleted_at = NONE
    ORDER BY first_name ASC
    LIMIT ${limit}
  `;
  const users = unwrapQueryResult<{id: unknown; first_name?: string; last_name?: string}>(await db.query(query));
  const search = options.search?.toLowerCase();

  return users
    .map(user => ({
      id: recordToString(user.id),
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
    }))
    .filter(user => !search || user.name.toLowerCase().includes(search));
};

export const listCategories = async (db: DbClient, options: {limit?: number} = {}) => {
  const limit = options.limit ?? 50;
  const query = `SELECT id, name FROM ${Tables.categories} ORDER BY name ASC LIMIT ${limit}`;
  const categories = unwrapQueryResult<{id: unknown; name?: string}>(await db.query(query));
  return categories.map(cat => ({id: recordToString(cat.id), name: cat.name ?? "Unknown"}));
};

export const getSalesDashboardSnapshot = async (db: DbClient, options: DateRangeFilter) => {
  const summary = await import("@/api/reports/sales").then(m => m.getSalesSummary(db, options));
  const topDishes = await import("@/api/reports/sales").then(m =>
    m.getTopSellingDishes(db, {...options, limit: 5, sortBy: "revenue"}),
  );

  return {
    totalNetSales: summary.totalNetSales,
    amountCollected: summary.paymentSummary.amountCollected,
    totalVoids: summary.totalVoids,
    totalDiscounts: summary.totalDiscounts,
    taxes: summary.taxes,
    orderTypeBreakdown: summary.orderTypeBreakdown,
    dayPartTotals: summary.dayPartTotals,
    topDishes,
  };
};

export {getDayPartLabel};
