import i18n from "@/lib/i18n.ts";
import {Closing} from "@/api/model/closing.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  ClosingCycleWindow,
  CLOSING_CYCLE_KEY,
  closingCycleConfigFromSetting,
  formatClosingCycleTime,
  getLastCycleEndTime,
  isClosingCycleEnabled,
  isWithinActiveClosingCycle,
  loadClosingCycleConfig,
  resolveClosingWindow,
  type ClosingCycleConfig,
} from "@/lib/closing-cycle.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import {OrderStatus} from "@/api/model/order.ts";
import {getCatalogTable} from "@/infrastructure/pos-store/catalog.ts";
import type {Setting} from "@/api/model/setting.ts";
import {toRecordId} from "@/lib/utils.ts";

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

/**
 * `shiftId` scopes the lookup to one shift's own closing within the window,
 * so a second shift starting a closing the same day gets its own record
 * instead of finding (and overwriting) the first shift's. `undefined` means
 * "don't care" (any shift); `null` means "only the no-shift record" — pass
 * the value from the caller's current user's shift as-is.
 */
export const getClosingRecordForWindow = async (
  db: DBLike,
  window: ClosingCycleWindow,
  shiftId?: string | null
): Promise<Closing | null> => {
  const scopeToShift = shiftId !== undefined;
  const [result] = await db.query(
    `
      SELECT *
      FROM ${Tables.closings}
      WHERE date_from = $dateFrom
        ${scopeToShift ? (shiftId ? "AND shift = $shiftId" : "AND shift = NONE") : ""}
      ORDER BY created_at DESC
      LIMIT 1
      FETCH shift, closed_by
    `,
    {
      dateFrom: toSurrealDateTime(window.date_from),
      ...(scopeToShift && shiftId ? {shiftId: toRecordId(shiftId)} : {}),
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    return null;
  }

  return result[0] as Closing;
};

/** All closings for a window, one per shift — used to list/report every
 *  shift's closing for a day instead of just the latest. */
export const getClosingRecordsForWindow = async (
  db: DBLike,
  window: ClosingCycleWindow
): Promise<Closing[]> => {
  const [result] = await db.query(
    `
      SELECT *
      FROM ${Tables.closings}
      WHERE date_from = $dateFrom
      ORDER BY created_at ASC
      FETCH shift
    `,
    {
      dateFrom: toSurrealDateTime(window.date_from),
    }
  );

  return Array.isArray(result) ? (result as Closing[]) : [];
};

export const getCurrentCycleClosing = async (
  db: DBLike,
  now: Date = new Date(),
  shiftId?: string | null
): Promise<Closing | null> => {
  const {window} = await resolveClosingWindow(db, now);
  return getClosingRecordForWindow(db, window, shiftId);
};

/** Cash left in the drawer for the next shift: prefers drawer_float, falls
 *  back to closing_balance for closings saved before that field existed. */
export const getPreviousClosingBalance = async (
  db: DBLike,
  window: ClosingCycleWindow,
  excludeId?: string | null
): Promise<number> => {
  const [result] = await db.query(
    `
      SELECT drawer_float, closing_balance, closed_at, created_at
      FROM ${Tables.closings}
      WHERE status = 'completed'
        AND date_from <= $dateFrom
        ${excludeId ? "AND id != $excludeId" : ""}
      ORDER BY closed_at DESC, created_at DESC
      LIMIT 1
    `,
    {
      dateFrom: toSurrealDateTime(window.date_from),
      ...(excludeId ? {excludeId: toRecordId(excludeId)} : {}),
    }
  );

  const row = Array.isArray(result)
    ? result[0] as { drawer_float?: number | null; closing_balance?: number } | undefined
    : undefined;
  if (!row) return 0;
  if (row.drawer_float != null && !Number.isNaN(Number(row.drawer_float))) {
    return Number(row.drawer_float);
  }
  return Number(row.closing_balance || 0);
};

/**
 * Order-taking gate: ANY shift's completed closing for the window ends the
 * business day for everyone, regardless of who closed it — intentionally
 * unscoped by shift (unlike getCurrentCycleClosing, used by the Closing
 * screen itself to find/create the current user's own record).
 */
export const isCurrentCycleClosed = async (db: DBLike, now: Date = new Date()): Promise<boolean> => {
  const {config} = await loadClosingCycleConfig(db);
  if (!isClosingCycleEnabled(config)) {
    return false;
  }

  const {window} = await resolveClosingWindow(db, now);
  const closings = await getClosingRecordsForWindow(db, window);
  return closings.some((closing) => closing.status === "completed");
};

async function loadClosingCycleConfigLocal(): Promise<{
  setting: Setting | null;
  config: ClosingCycleConfig;
}> {
  const rows = await getCatalogTable<Setting>(Tables.settings);
  const setting =
    rows.find((row) => row?.key === CLOSING_CYCLE_KEY && row?.is_global === true) ?? null;
  return {
    setting,
    config: closingCycleConfigFromSetting(setting),
  };
}

/**
 * FOH-safe closing gate: PosStore `setting` only — no Surreal round-trips.
 * Pass `dayClosingCompleted` from the cached enforcement atom when available.
 */
export async function getClosingEnforcementStateLocal(
  now: Date = new Date(),
  dayClosingCompleted = false,
): Promise<ClosingEnforcementState> {
  const {config} = await loadClosingCycleConfigLocal();
  return enforcementFromConfig(config, dayClosingCompleted, now);
}

async function resolveClosingCycleConfig(db: DBLike): Promise<ClosingCycleConfig> {
  // Prefer PosStore so FOH / background ticks do not depend on Surreal for config.
  try {
    const local = await loadClosingCycleConfigLocal();
    if (local.setting) {
      return local.config;
    }
  } catch {
    // Dexie not ready yet — fall through to Surreal.
  }
  try {
    const {config} = await loadClosingCycleConfig(db);
    return config;
  } catch (error) {
    console.warn("Closing cycle: Surreal unavailable, using PosStore defaults", error);
    const {config} = await loadClosingCycleConfigLocal();
    return config;
  }
}

function enforcementFromConfig(
  config: ClosingCycleConfig,
  dayClosingCompleted: boolean,
  now: Date
): ClosingEnforcementState {
  if (!isClosingCycleEnabled(config)) {
    return {
      orderTakingBlocked: false,
      orderMutationsBlocked: false,
      cycleEndedAt: null,
      dayClosingCompleted: false,
      message: null,
    };
  }

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
}

export const getClosingEnforcementState = async (
  db: DBLike,
  now: Date = new Date()
): Promise<ClosingEnforcementState> => {
  const config = await resolveClosingCycleConfig(db);

  let dayClosingCompleted = false;
  try {
    dayClosingCompleted = await isCurrentCycleClosed(db, now);
  } catch (error) {
    // Offline / Surreal down: keep taking orders based on local cycle window only.
    console.warn("Closing cycle: could not verify day closing record", error);
    dayClosingCompleted = false;
  }

  return enforcementFromConfig(config, dayClosingCompleted, now);
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
  const open = await listOpenOrdersInCurrentCycle(db);
  return open.length > 0;
};

export type OpenOrderForClosing = {
  id: string;
  invoice_number?: number | string | null;
  table_name?: string;
  status: string;
  total: number;
};

export const listOpenOrdersInCurrentCycle = async (
  db: DBLike,
  now: Date = new Date()
): Promise<OpenOrderForClosing[]> => {
  const {window} = await resolveClosingWindow(db, now);
  const [result] = await db.query(
    `
      SELECT id, invoice_number, status, total, table, created_at
      FROM ${Tables.orders}
      WHERE created_at >= $start
        AND created_at <= $end
        AND status IN $statuses
      ORDER BY created_at ASC
      FETCH table
    `,
    {
      start: toSurrealDateTime(window.date_from),
      end: toSurrealDateTime(window.date_to),
      statuses: OPEN_ORDER_STATUSES
    }
  );

  if (!Array.isArray(result)) return [];

  return result.map((row: any) => ({
    id: String(row.id),
    invoice_number: row.invoice_number,
    table_name: row.table?.name || undefined,
    status: String(row.status || ""),
    total: Number(row.total || 0),
  }));
};
