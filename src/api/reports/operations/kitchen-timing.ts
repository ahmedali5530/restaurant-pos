import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {parseHourRangeFromPhrase} from "@/api/reports/shared/filters.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";

const getTicketSeconds = (order: Order): number | null => {
  if (!order.created_at || !order.completed_at) {
    return null;
  }
  const created = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]).getTime();
  const completed = toJsDate(order.completed_at as Parameters<typeof toJsDate>[0]).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(completed) || completed < created) {
    return null;
  }
  return Math.floor((completed - created) / 1000);
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const aggregateDurations = (durations: number[]) => ({
  orderCount: durations.length,
  avgSeconds: durations.length > 0
    ? safeNumber(durations.reduce((s, v) => s + v, 0) / durations.length)
    : 0,
  medianSeconds: median(durations),
  p90Seconds: percentile([...durations].sort((a, b) => a - b), 90),
});

export const getPrepTimesByOrderType = async (
  db: DbClient,
  options: DateRangeFilter = {},
) => {
  const {conditions, params} = buildCreatedAtDateConditions(options);
  const orderConditions = ["status = 'Paid'", ...conditions];

  const orders = unwrapQueryResult<Order>(
    await db.query(
      `
        SELECT * FROM ${Tables.orders}
        WHERE ${orderConditions.join(" AND ")}
        FETCH order_type
      `,
      params,
    ),
  );

  const byType = new Map<string, number[]>();
  orders.forEach(order => {
    const typeName = order.order_type?.name
      || (typeof order.order_type === "string" ? order.order_type : "Unknown");
    const seconds = getTicketSeconds(order);
    if (seconds === null) {
      return;
    }
    const list = byType.get(typeName) || [];
    list.push(seconds);
    byType.set(typeName, list);
  });

  const metricNote = "Ticket time = created_at to completed_at (check close).";

  return {
    metricNote,
    byOrderType: Array.from(byType.entries()).map(([orderType, durations]) => ({
      orderType,
      ...aggregateDurations(durations),
    })).sort((a, b) => b.avgSeconds - a.avgSeconds),
  };
};

export const getKitchenStationDelays = async (
  db: DbClient,
  options: DateRangeFilter & {
    startHour?: number;
    endHour?: number;
    hourPhrase?: string;
  } = {},
) => {
  let startHour = options.startHour ?? 19;
  let endHour = options.endHour ?? 21;
  if (options.hourPhrase) {
    const parsed = parseHourRangeFromPhrase(options.hourPhrase);
    if (parsed) {
      startHour = parsed.startHour;
      endHour = parsed.endHour;
    }
  }

  const {conditions, params} = buildCreatedAtDateConditions(options, "activated_at");
  const queryConditions = ["activated_at != NONE", "completed_at != NONE", ...conditions];

  const rows = unwrapQueryResult<{
    kitchen?: {name?: string; id?: unknown};
    stage_name?: string;
    activated_at?: unknown;
    completed_at?: unknown;
    order_item?: {item?: {name?: string; categories?: Array<{name?: string}>}};
  }>(
    await db.query(
      `
        SELECT * FROM ${Tables.order_items_kitchen}
        WHERE ${queryConditions.join(" AND ")}
        FETCH kitchen, order_item, order_item.item, order_item.item.categories
      `,
      params,
    ),
  );

  const inPeakWindow = rows.filter(row => {
    if (!row.activated_at) {
      return false;
    }
    const hour = toJsDate(row.activated_at as Parameters<typeof toJsDate>[0]).getHours();
    return hour >= startHour && hour < endHour;
  });

  const prepSeconds = (row: typeof rows[0]): number | null => {
    if (!row.activated_at || !row.completed_at) {
      return null;
    }
    const start = toJsDate(row.activated_at as Parameters<typeof toJsDate>[0]).getTime();
    const end = toJsDate(row.completed_at as Parameters<typeof toJsDate>[0]).getTime();
    if (end < start) {
      return null;
    }
    return Math.floor((end - start) / 1000);
  };

  const aggregateGroup = (key: string, durations: number[]) => ({
    name: key,
    ...aggregateDurations(durations),
  });

  const byKitchen = new Map<string, number[]>();
  const byStage = new Map<string, number[]>();
  const byCategory = new Map<string, number[]>();

  inPeakWindow.forEach(row => {
    const seconds = prepSeconds(row);
    if (seconds === null) {
      return;
    }
    const kitchenName = row.kitchen?.name || recordToString(row.kitchen) || "Unknown kitchen";
    const stageName = row.stage_name || "Unknown stage";
    const categories = row.order_item?.item?.categories ?? [];
    const categoryName = categories[0]?.name || row.order_item?.item?.name || "Uncategorized";

    const kList = byKitchen.get(kitchenName) || [];
    kList.push(seconds);
    byKitchen.set(kitchenName, kList);

    const sList = byStage.get(stageName) || [];
    sList.push(seconds);
    byStage.set(stageName, sList);

    const cList = byCategory.get(categoryName) || [];
    cList.push(seconds);
    byCategory.set(categoryName, cList);
  });

  return {
    peakHourRange: {startHour, endHour},
    itemCount: inPeakWindow.length,
    byKitchen: Array.from(byKitchen.entries())
      .map(([name, durations]) => aggregateGroup(name, durations))
      .sort((a, b) => b.avgSeconds - a.avgSeconds),
    byStage: Array.from(byStage.entries())
      .map(([name, durations]) => aggregateGroup(name, durations))
      .sort((a, b) => b.avgSeconds - a.avgSeconds),
    byCategory: Array.from(byCategory.entries())
      .map(([name, durations]) => aggregateGroup(name, durations))
      .sort((a, b) => b.avgSeconds - a.avgSeconds),
  };
};
