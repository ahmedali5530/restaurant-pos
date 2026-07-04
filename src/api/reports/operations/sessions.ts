import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import type {TimeEntry} from "@/api/model/time_entry.ts";
import {recordIdToString, toQueryRecordId} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {getOrderPaymentTotals} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";
import {DateTime} from "luxon";

export interface ActiveSessionSummary {
  sessionId: string;
  userId: string;
  userName: string;
  role?: string;
  shift?: string;
  platform?: string;
  clockIn: string;
  sessionDurationSeconds: number;
  sessionDurationLabel: string;
  isActive: true;
}

export interface SessionSalesRow extends ActiveSessionSummary {
  netSales: number;
  checks: number;
  guests: number;
  avgCheck: number;
  avgGuestSale: number;
}

const formatUserName = (user: TimeEntry["user"]): string => {
  if (!user || typeof user !== "object") {
    return "Unknown";
  }
  const u = user as {first_name?: string; last_name?: string; login?: string};
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return name || u.login || "Unknown";
};

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const formatClockIn = (clockIn: TimeEntry["clock_in"]): string => {
  const jsDate = toJsDate(clockIn as Parameters<typeof toJsDate>[0]);
  return DateTime.fromJSDate(jsDate).toFormat(import.meta.env.VITE_DATE_TIME_FORMAT as string);
};

const resolveUserRef = (user: TimeEntry["user"]) => {
  if (!user) {
    return null;
  }
  try {
    const userId = typeof user === "object" && user !== null && "id" in user
      ? (user as {id: unknown}).id
      : user;
    return toQueryRecordId(userId, Tables.users);
  } catch {
    return null;
  }
};

const mapActiveSession = (entry: TimeEntry): ActiveSessionSummary => {
  const user = entry.user as {
    user_role?: {name?: string};
    user_shift?: {name?: string};
  } | undefined;
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - toJsDate(entry.clock_in as Parameters<typeof toJsDate>[0]).getTime()) / 1000),
  );

  return {
    sessionId: recordIdToString(entry.id),
    userId: recordIdToString(entry.user),
    userName: formatUserName(entry.user),
    role: user?.user_role?.name,
    shift: user?.user_shift?.name,
    platform: entry.platform,
    clockIn: formatClockIn(entry.clock_in),
    sessionDurationSeconds: durationSeconds,
    sessionDurationLabel: formatDuration(durationSeconds),
    isActive: true,
  };
};

const calculateSessionNetSales = (order: Order): number => {
  const paymentTotals = getOrderPaymentTotals(order);
  return safeNumber(
    paymentTotals.amountCollected
    - safeNumber(order.service_charge_amount)
    - safeNumber(order.tax_amount),
  );
};

const fetchActiveEntries = async (db: DbClient): Promise<TimeEntry[]> => {
  const result = await db.query(
    `
      SELECT * FROM ${Tables.time_entries}
      WHERE clock_out = NONE
      ORDER BY clock_in ASC
      LIMIT 30
      FETCH user, user.user_role, user.user_shift
    `,
  );
  return unwrapQueryResult<TimeEntry>(result);
};

/** Mirrors Clock screen order query — same record id + datetime binding. */
const fetchSessionOrders = async (
  db: DbClient,
  entry: TimeEntry,
): Promise<Order[]> => {
  const userRef = resolveUserRef(entry.user);
  if (!userRef || !entry.clock_in) {
    return [];
  }

  const result = await db.query(
    `
      SELECT * FROM ${Tables.orders}
      WHERE user = $userId
        AND created_at >= $clockInTime
        AND created_at <= time::now()
        AND status = 'Paid'
      FETCH payments, payments.payment_type
    `,
    {
      userId: userRef,
      clockInTime: entry.clock_in,
    },
  );

  return unwrapQueryResult<Order>(result);
};

export const getActiveSessions = async (db: DbClient): Promise<ActiveSessionSummary[]> => {
  const entries = await fetchActiveEntries(db);
  return entries.map(mapActiveSession);
};

export const getCurrentSessionServerSales = async (db: DbClient) => {
  const entries = await fetchActiveEntries(db);

  if (entries.length === 0) {
    return {
      activeSessionCount: 0,
      orderTakers: [] as SessionSalesRow[],
      totals: {
        netSales: 0,
        checks: 0,
        guests: 0,
        avgCheck: 0,
        avgGuestSale: 0,
      },
    };
  }

  const orderTakers: SessionSalesRow[] = [];

  for (const entry of entries) {
    const session = mapActiveSession(entry);
    let sessionOrders: Order[] = [];

    try {
      sessionOrders = await fetchSessionOrders(db, entry);
    } catch (err) {
      console.error("Session order fetch failed for", session.userId, err);
      sessionOrders = [];
    }

    const netSales = sessionOrders.reduce((sum, order) => sum + calculateSessionNetSales(order), 0);
    const checks = sessionOrders.length;
    const guests = sessionOrders.reduce((sum, order) => sum + safeNumber(order.covers ?? 1), 0);

    orderTakers.push({
      ...session,
      netSales,
      checks,
      guests,
      avgCheck: checks > 0 ? safeNumber(netSales / checks) : 0,
      avgGuestSale: guests > 0 ? safeNumber(netSales / guests) : 0,
    });
  }

  orderTakers.sort((a, b) => b.netSales - a.netSales);

  const totals = orderTakers.reduce(
    (acc, row) => ({
      netSales: acc.netSales + row.netSales,
      checks: acc.checks + row.checks,
      guests: acc.guests + row.guests,
      avgCheck: 0,
      avgGuestSale: 0,
    }),
    {netSales: 0, checks: 0, guests: 0, avgCheck: 0, avgGuestSale: 0},
  );

  totals.avgCheck = totals.checks > 0 ? safeNumber(totals.netSales / totals.checks) : 0;
  totals.avgGuestSale = totals.guests > 0 ? safeNumber(totals.netSales / totals.guests) : 0;

  return {
    activeSessionCount: orderTakers.length,
    orderTakers,
    totals,
  };
};
