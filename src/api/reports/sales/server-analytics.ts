import type {Order} from "@/api/model/order.ts";
import type {OrderVoid} from "@/api/model/order_void.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {calculateOrderNetSales} from "@/api/reports/sales/aggregate.ts";
import {fetchPaidOrders} from "@/api/reports/sales/fetch.ts";
import {Tables} from "@/api/db/tables.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {
  aggregateOrderDiscountBreakdown,
  getOrderCartDiscountAmount,
  getOrderFilteredItems,
} from "@/lib/order.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {safeNumber} from "@/lib/utils.ts";

const TICKET_TIME_NOTE =
  "Ticket time = order created_at to completed_at (check close). Not rider delivery time.";

const formatUserName = (user?: {first_name?: string; last_name?: string; login?: string} | null): string => {
  if (!user || typeof user !== "object") {
    return "Unknown";
  }
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.login || "Unknown";
};

const getUserId = (user: unknown): string => recordIdToString(
  typeof user === "object" && user !== null && "id" in user
    ? (user as {id: unknown}).id
    : user,
);

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

const hasTable = (order: Order): boolean => Boolean(order.table);

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
};

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

export interface ServerTicketTimeRow {
  userId: string;
  userName: string;
  checkCount: number;
  dineInCheckCount: number;
  avgTicketSeconds: number;
  medianTicketSeconds: number;
  p90TicketSeconds: number;
  avgDineInTurnaroundSeconds: number;
  avgGuestCheck: number;
}

export const getServerTicketTimes = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number; dineInOnly?: boolean},
) => {
  const limit = options.limit ?? 3;
  const orders = await fetchPaidOrders(db, {
    startDate: options.startDate,
    endDate: options.endDate,
    fetches: ["user", "table", "order_type", "payments", "payments.payment_type", "items", "items.taxes", "items.tax_mode", "tax", "order_taxes", "order_taxes.tax"],
  });

  const scopedOrders = options.dineInOnly
    ? orders.filter(order => hasTable(order))
    : orders;

  const byUser = new Map<string, {
    userName: string;
    ticketTimes: number[];
    dineInTimes: number[];
    netSales: number;
    checks: number;
  }>();

  scopedOrders.forEach(order => {
    const userId = getUserId(order.user);
    const ticketSeconds = getTicketSeconds(order);
    const row = byUser.get(userId) || {
      userName: formatUserName(order.user as {first_name?: string; last_name?: string; login?: string}),
      ticketTimes: [],
      dineInTimes: [],
      netSales: 0,
      checks: 0,
    };

    row.checks += 1;
    row.netSales += calculateOrderNetSales(order);
    if (ticketSeconds !== null) {
      row.ticketTimes.push(ticketSeconds);
      if (hasTable(order)) {
        row.dineInTimes.push(ticketSeconds);
      }
    }
    byUser.set(userId, row);
  });

  const servers: ServerTicketTimeRow[] = Array.from(byUser.entries())
    .filter(([, data]) => data.ticketTimes.length > 0)
    .map(([userId, data]) => ({
      userId,
      userName: data.userName,
      checkCount: data.checks,
      dineInCheckCount: data.dineInTimes.length,
      avgTicketSeconds: safeNumber(
        data.ticketTimes.reduce((s, v) => s + v, 0) / data.ticketTimes.length,
      ),
      medianTicketSeconds: median(data.ticketTimes),
      p90TicketSeconds: percentile([...data.ticketTimes].sort((a, b) => a - b), 90),
      avgDineInTurnaroundSeconds: data.dineInTimes.length > 0
        ? safeNumber(data.dineInTimes.reduce((s, v) => s + v, 0) / data.dineInTimes.length)
        : 0,
      avgGuestCheck: data.checks > 0 ? safeNumber(data.netSales / data.checks) : 0,
    }));

  const bySpeed = [...servers].sort((a, b) => a.avgTicketSeconds - b.avgTicketSeconds);

  return {
    metricNote: TICKET_TIME_NOTE,
    orderCount: scopedOrders.length,
    fastest: bySpeed.slice(0, limit),
    slowest: [...bySpeed].reverse().slice(0, limit),
    lowestTurnaroundHighestCheck: [...servers]
      .filter(row => row.dineInCheckCount > 0)
      .sort((a, b) => {
        const scoreA = a.avgGuestCheck / Math.max(a.avgDineInTurnaroundSeconds, 1);
        const scoreB = b.avgGuestCheck / Math.max(b.avgDineInTurnaroundSeconds, 1);
        return scoreB - scoreA;
      })
      .slice(0, limit),
    servers,
  };
};

export interface StaffAccountabilityRow {
  userId: string;
  userName: string;
  checkCount: number;
  netSales: number;
  voidCount: number;
  voidAmount: number;
  voidRate: number;
  discountCount: number;
  discountAmount: number;
  discountRate: number;
  deletedItemCount: number;
  deletedItemRate: number;
  flagged: boolean;
  flagReasons: string[];
}

export const getStaffAccountabilityMetrics = async (
  db: DbClient,
  options: DateRangeFilter & {thresholdMultiplier?: number},
) => {
  const threshold = options.thresholdMultiplier ?? 1.5;
  const {conditions, params} = buildCreatedAtDateConditions(options);

  const [orders, voidResult] = await Promise.all([
    fetchPaidOrders(db, {
      ...options,
      fetches: [
        "user",
        "items",
        "items.item",
        "order_discounts",
        "order_discounts.discount",
        "discount",
        "payments",
        "payments.payment_type",
        "items.taxes",
        "items.tax_mode",
        "tax",
        "order_taxes",
        "order_taxes.tax",
      ],
    }),
    db.query(
      `
        SELECT * FROM ${Tables.order_voids}
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        FETCH order, order.user, deleted_by, items, items.item
      `,
      params,
    ),
  ]);

  const voids = unwrapQueryResult<OrderVoid>(voidResult);
  const byUser = new Map<string, StaffAccountabilityRow>();

  const ensureRow = (userId: string, userName: string): StaffAccountabilityRow => {
    const existing = byUser.get(userId);
    if (existing) {
      return existing;
    }
    const row: StaffAccountabilityRow = {
      userId,
      userName,
      checkCount: 0,
      netSales: 0,
      voidCount: 0,
      voidAmount: 0,
      voidRate: 0,
      discountCount: 0,
      discountAmount: 0,
      discountRate: 0,
      deletedItemCount: 0,
      deletedItemRate: 0,
      flagged: false,
      flagReasons: [],
    };
    byUser.set(userId, row);
    return row;
  };

  orders.forEach(order => {
    const userId = getUserId(order.user);
    const row = ensureRow(userId, formatUserName(order.user as {first_name?: string; last_name?: string; login?: string}));
    row.checkCount += 1;
    row.netSales += calculateOrderNetSales(order);

    const deletedItems = (order.items ?? []).filter(item => item?.deleted_at !== undefined);
    row.deletedItemCount += deletedItems.length;
  });

  voids.forEach(voidEntry => {
    const order = voidEntry.order as Order | undefined;
    const userId = order ? getUserId(order.user) : "unknown";
    const userName = order
      ? formatUserName(order.user as {first_name?: string; last_name?: string; login?: string})
      : "Unknown";
    const row = ensureRow(userId, userName);
    row.voidCount += 1;
    const voidAmount = (voidEntry.items ?? []).reduce((sum, item) => {
      return sum + safeNumber(calculateOrderItemPrice({
        ...(item as object),
        quantity: safeNumber(voidEntry.quantity ?? 1),
      } as Parameters<typeof calculateOrderItemPrice>[0]));
    }, 0);
    row.voidAmount += voidAmount;
  });

  const discountByUser = aggregateOrderDiscountBreakdown(orders, "user");
  discountByUser.forEach(entry => {
    const match = Array.from(byUser.values()).find(row => row.userName === entry.name);
    if (match) {
      match.discountCount += entry.quantity;
      match.discountAmount += entry.total;
    }
  });

  const allStaff = Array.from(byUser.values());
  const teamChecks = allStaff.reduce((s, r) => s + r.checkCount, 0) || 1;
  const teamVoids = allStaff.reduce((s, r) => s + r.voidCount, 0) / teamChecks;
  const teamDiscounts = allStaff.reduce((s, r) => s + r.discountCount, 0) / teamChecks;
  const teamDeleted = allStaff.reduce((s, r) => s + r.deletedItemCount, 0) / teamChecks;

  allStaff.forEach(row => {
    row.voidRate = row.checkCount > 0 ? safeNumber(row.voidCount / row.checkCount) : 0;
    row.discountRate = row.checkCount > 0 ? safeNumber(row.discountCount / row.checkCount) : 0;
    row.deletedItemRate = row.checkCount > 0 ? safeNumber(row.deletedItemCount / row.checkCount) : 0;

    const reasons: string[] = [];
    if (teamVoids > 0 && row.voidRate > teamVoids * threshold) {
      reasons.push("void_rate");
    }
    if (teamDiscounts > 0 && row.discountRate > teamDiscounts * threshold) {
      reasons.push("discount_rate");
    }
    if (teamDeleted > 0 && row.deletedItemRate > teamDeleted * threshold) {
      reasons.push("deleted_item_rate");
    }
    row.flagged = reasons.length > 0;
    row.flagReasons = reasons;
  });

  return {
    thresholdMultiplier: threshold,
    teamAverages: {
      voidRate: safeNumber(teamVoids),
      discountRate: safeNumber(teamDiscounts),
      deletedItemRate: safeNumber(teamDeleted),
    },
    flaggedStaff: allStaff.filter(row => row.flagged).sort((a, b) => b.voidRate - a.voidRate),
    allStaff: allStaff.sort((a, b) => b.voidRate - a.voidRate),
  };
};

export const isOrderComp = (order: Order): boolean => {
  const filteredItems = getOrderFilteredItems(order);
  const totalDiscount = getOrderCartDiscountAmount(order);
  const itemDiscounts = safeNumber(
    filteredItems.reduce((sum, item) => sum + safeNumber(item?.discount), 0),
  );
  const grossTotal = safeNumber(
    filteredItems.reduce((sum, item) => sum + calculateOrderItemPrice(item), 0),
  );
  return grossTotal > 0 && (totalDiscount >= grossTotal || itemDiscounts >= grossTotal);
};

export const getOrderCompAmount = (order: Order): number => {
  if (!isOrderComp(order)) {
    return 0;
  }
  const filteredItems = getOrderFilteredItems(order);
  return safeNumber(
    filteredItems.reduce((sum, item) => sum + calculateOrderItemPrice(item), 0),
  );
};
