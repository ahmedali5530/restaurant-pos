import i18n from "@/lib/i18n.ts";
import {Closing} from "@/api/model/closing.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  ClosingCycleWindow,
  formatClosingCycleTime,
  getLastCycleEndTime,
  isClosingCycleEnabled,
  isWithinActiveClosingCycle,
  loadClosingCycleConfig,
  resolveClosingWindow,
} from "@/lib/closing-cycle.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import {OrderStatus} from "@/api/model/order.ts";

type DBLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

export type ClosingEnforcementState = {
  orderTakingBlocked: boolean;
  orderMutationsBlocked: boolean;
  cycleEndedAt: Date | null;
  dayClosingCompleted: boolean;
  message: string | null;
};

export const getOrderPunchDisabledMessage = () => {
  return i18n.t("closing:guard.punchDisabled");
};

export const getCycleEndedMessage = (cycleEndedAt: Date) => {
  return i18n.t("closing:guard.cycleEnded", {time: formatClosingCycleTime(cycleEndedAt)});
};

export const getClosingRecordForWindow = async (
  db: DBLike,
  window: ClosingCycleWindow
): Promise<Closing | null> => {
  const [result] = await db.query(
    `
      SELECT *
      FROM ${Tables.closings}
      WHERE date_from = $dateFrom
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      dateFrom: toSurrealDateTime(window.date_from),
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }

  return result[0] as Closing;
};

export const getCurrentCycleClosing = async (db: DBLike, now: Date = new Date()): Promise<Closing | null> => {
  const {window} = await resolveClosingWindow(db, now);
  return getClosingRecordForWindow(db, window);
};

export const isCurrentCycleClosed = async (db: DBLike, now: Date = new Date()): Promise<boolean> => {
  const {config} = await loadClosingCycleConfig(db);
  if (!isClosingCycleEnabled(config)) {
    return false;
  }

  const closing = await getCurrentCycleClosing(db, now);
  return closing?.status === "completed";
};

export const getClosingEnforcementState = async (
  db: DBLike,
  now: Date = new Date()
): Promise<ClosingEnforcementState> => {
  const {config} = await loadClosingCycleConfig(db);

  if (!isClosingCycleEnabled(config)) {
    return {
      orderTakingBlocked: false,
      orderMutationsBlocked: false,
      cycleEndedAt: null,
      dayClosingCompleted: false,
      message: null,
    };
  }

  const dayClosingCompleted = await isCurrentCycleClosed(db, now);

  if (dayClosingCompleted) {
    const message = getOrderPunchDisabledMessage();
    return {
      orderTakingBlocked: true,
      orderMutationsBlocked: true,
      cycleEndedAt: null,
      dayClosingCompleted: true,
      message,
    };
  }

  const withinCycle = isWithinActiveClosingCycle(config, now);

  if (withinCycle) {
    return {
      orderTakingBlocked: false,
      orderMutationsBlocked: false,
      cycleEndedAt: null,
      dayClosingCompleted: false,
      message: null,
    };
  }

  const cycleEndedAt = getLastCycleEndTime(config, now);
  const message = cycleEndedAt ? getCycleEndedMessage(cycleEndedAt) : getOrderPunchDisabledMessage();

  return {
    orderTakingBlocked: true,
    orderMutationsBlocked: true,
    cycleEndedAt,
    dayClosingCompleted: false,
    message,
  };
};

export const assertOrderTakingAllowed = async (db: DBLike) => {
  const state = await getClosingEnforcementState(db);
  if (state.orderTakingBlocked && state.message) {
    throw new Error(state.message);
  }
};

export const assertMenuEntryAllowed = async (db: DBLike) => {
  await assertOrderTakingAllowed(db);
};

export const assertOrderMutationsAllowed = async (db: DBLike) => {
  const state = await getClosingEnforcementState(db);
  if (state.orderMutationsBlocked && state.message) {
    throw new Error(state.message);
  }
};

/** @deprecated Use assertOrderTakingAllowed instead */
export const assertOrderPunchAllowed = assertOrderTakingAllowed;

const OPEN_ORDER_STATUSES = [
  OrderStatus["In Progress"],
  OrderStatus.Pending
];

export const hasOpenOrdersInCurrentCycle = async (db: DBLike): Promise<boolean> => {
  const {window} = await resolveClosingWindow(db, new Date());
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
      start: toSurrealDateTime(window.date_from),
      end: toSurrealDateTime(window.date_to),
      statuses: OPEN_ORDER_STATUSES
    }
  );

  return Array.isArray(result) && result.length > 0;
};
