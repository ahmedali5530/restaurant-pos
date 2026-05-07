import {Tables} from "@/api/db/tables.ts";
import {getActiveClosingWindow} from "@/lib/closing-cycle.ts";
import {DateTime} from "luxon";
import {OrderStatus} from "@/api/model/order.ts";

type DBLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export const getOrderPunchDisabledMessage = () => {
  const window = getActiveClosingWindow(new Date());
  const unlockAt = DateTime.fromJSDate(window.date_to).plus({milliseconds: 1}).toFormat("dd LLL yyyy, hh:mm a");
  return `Punching is disabled until ${unlockAt}, or delete current cycle closing.`;
};

export const getCurrentCycleClosing = async (db: DBLike) => {
  const now = new Date();
  const [result] = await db.query(
    `
      SELECT *
      FROM ${Tables.closings}
      WHERE date_from <= $now
        AND date_to >= $now
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      now,
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }

  return result[0] as Record<string, unknown>;
};

export const isCurrentCycleClosed = async (db: DBLike): Promise<boolean> => {
  const closing = await getCurrentCycleClosing(db);
  return closing?.status === "completed";
};

export const assertOrderPunchAllowed = async (db: DBLike) => {
  const closed = await isCurrentCycleClosed(db);
  if (closed) {
    throw new Error(getOrderPunchDisabledMessage());
  }
};

const OPEN_ORDER_STATUSES = [
  OrderStatus["In Progress"],
  OrderStatus.Pending
];

export const hasOpenOrdersInCurrentCycle = async (db: DBLike): Promise<boolean> => {
  const window = getActiveClosingWindow(new Date());
  const [result] = await db.query(
    `
      SELECT id
      FROM ${Tables.orders}
      WHERE created_at >= $start
        AND created_at <= $end
        AND status IN $statuses
      LIMIT 1
    `,
    {
      start: window.date_from,
      end: window.date_to,
      statuses: OPEN_ORDER_STATUSES
    }
  );

  return Array.isArray(result) && result.length > 0;
};

