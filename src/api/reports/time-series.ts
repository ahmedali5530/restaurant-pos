import {Tables} from "@/api/db/tables.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {DateTime} from "luxon";
import {getInventoryMovements, type InventoryMovementType} from "@/api/reports/inventory/index.ts";

export type TimeSeriesMetric =
  | "net_sales"
  | "order_count"
  | "void_amount"
  | "consumption_qty"
  | "waste_qty"
  | "purchase_qty";

export type TimeSeriesGranularity = "daily" | "weekly" | "hourly";

const bucketKey = (date: DateTime, granularity: TimeSeriesGranularity) => {
  if (granularity === "hourly") {
    return date.toFormat("yyyy-LL-dd HH:00");
  }
  if (granularity === "weekly") {
    return date.startOf("week").toISODate() ?? date.toISODate() ?? "";
  }
  return date.toISODate() ?? "";
};

const aggregateOrders = (
  orders: Order[],
  granularity: TimeSeriesGranularity,
  valueFn: (order: Order) => number,
) => {
  const buckets = new Map<string, number>();
  orders.forEach(order => {
    const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);
    const key = bucketKey(DateTime.fromJSDate(jsDate), granularity);
    buckets.set(key, (buckets.get(key) ?? 0) + valueFn(order));
  });
  return Array.from(buckets.entries())
    .map(([period, value]) => ({period, value}))
    .sort((a, b) => a.period.localeCompare(b.period));
};

export const getTimeSeries = async (
  db: DbClient,
  options: DateRangeFilter & {
    metric: TimeSeriesMetric;
    granularity?: TimeSeriesGranularity;
  },
) => {
  const granularity = options.granularity ?? "daily";
  const {metric, ...dateRange} = options;

  if (metric === "net_sales" || metric === "order_count") {
    const conditions = metric === "net_sales" ? ["status = 'Paid'"] : [];
    const params: Record<string, string> = {};
    const {conditions: dateConditions, params: dateParams} = buildCreatedAtDateConditions(dateRange);
    conditions.push(...dateConditions);
    Object.assign(params, dateParams);

    const query = `
      SELECT * FROM ${Tables.orders}
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      FETCH payments
    `;
    const orders = unwrapQueryResult<Order>(await db.query(query, params));

    if (metric === "order_count") {
      return {
        metric,
        granularity,
        points: aggregateOrders(orders, granularity, () => 1),
      };
    }

    return {
      metric,
      granularity,
      points: aggregateOrders(orders, granularity, order => {
        const paymentTotals = getOrderPaymentTotals(order);
        return safeNumber(
          paymentTotals.amountCollected - safeNumber(order.service_charge_amount) - safeNumber(order.tax_amount),
        );
      }),
    };
  }

  if (metric === "void_amount") {
    const {conditions, params} = buildCreatedAtDateConditions(dateRange);
    const query = `
      SELECT * FROM ${Tables.order_voids}
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      FETCH items
    `;
    const voids = unwrapQueryResult<OrderVoid>(await db.query(query, params));
    const buckets = new Map<string, number>();

    voids.forEach(voidItem => {
      const jsDate = toJsDate(voidItem.created_at as Parameters<typeof toJsDate>[0]);
      const key = bucketKey(DateTime.fromJSDate(jsDate), granularity);
      const amount = (voidItem.items ?? []).reduce((sum, item) => {
        return sum + safeNumber(
          calculateOrderItemPrice({
            ...(item ?? {}),
            quantity: safeNumber(voidItem.quantity ?? 1),
          } as Parameters<typeof calculateOrderItemPrice>[0]),
        );
      }, 0);
      buckets.set(key, (buckets.get(key) ?? 0) + amount);
    });

    return {
      metric,
      granularity,
      points: Array.from(buckets.entries())
        .map(([period, value]) => ({period, value}))
        .sort((a, b) => a.period.localeCompare(b.period)),
    };
  }

  const movementType: Record<string, InventoryMovementType> = {
    consumption_qty: "issue",
    waste_qty: "waste",
    purchase_qty: "purchase",
  };
  const type = movementType[metric];
  if (!type) {
    throw new Error(`Unknown metric: ${metric}`);
  }

  const movement = await getInventoryMovements(db, {...dateRange, type, limit: 200});
  return {
    metric,
    granularity,
    points: movement.byItem.map(item => ({period: item.name, value: item.quantity})),
  };
};

export const comparePeriods = async (
  db: DbClient,
  options: {
    metric: TimeSeriesMetric | "sales_summary" | "voids" | "top_dishes";
    period1: DateRangeFilter;
    period2: DateRangeFilter;
  },
) => {
  const {metric, period1, period2} = options;

  const fetchMetric = async (range: DateRangeFilter) => {
    if (metric === "sales_summary" || metric === "net_sales") {
      const summary = await import("@/api/reports/sales").then(m => m.getSalesSummary(db, range));
      return summary.totalNetSales;
    }
    if (metric === "voids") {
      const voids = await import("@/api/reports/sales/extended.ts").then(m => m.getVoids(db, range));
      return voids.totalAmount;
    }
    if (metric === "top_dishes") {
      const dishes = await import("@/api/reports/sales").then(m =>
        m.getTopSellingDishes(db, {...range, limit: 1, sortBy: "revenue"}),
      );
      return dishes[0]?.revenue ?? 0;
    }
    const series = await getTimeSeries(db, {metric, ...range, granularity: "daily"});
    return series.points.reduce((sum, p) => sum + p.value, 0);
  };

  const [value1, value2] = await Promise.all([fetchMetric(period1), fetchMetric(period2)]);
  const delta = value2 - value1;
  const deltaPercent = value1 !== 0 ? (delta / value1) * 100 : value2 !== 0 ? 100 : 0;

  return {
    metric,
    period1: {...period1, value: value1},
    period2: {...period2, value: value2},
    delta,
    deltaPercent: Math.round(deltaPercent * 100) / 100,
  };
};
