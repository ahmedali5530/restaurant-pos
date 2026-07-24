import { Tables } from "@/api/db/tables.ts";
import {
  DEFAULT_PRINT_OPTIONS,
  PRINT_OPTIONS_KEY,
  PrintOptions,
} from "@/api/model/print_options.ts";
import type { OrderPrintType } from "@/api/model/order_print.ts";
import { toRecordId } from "@/lib/utils.ts";
import i18n from "@/lib/i18n.ts";
import { toast } from "sonner";
import type { ProtectedActionOptions } from "@/hooks/useSecurity.ts";

type PrintDB = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<any>;
  create: (table: string, data: Record<string, unknown>) => Promise<unknown>;
};

function firstRows<T = any>(raw: unknown): T[] {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (Array.isArray(first)) return first as T[];
    return raw as T[];
  }
  return [];
}

function normalizePrintOptions(raw?: Partial<PrintOptions> | null): PrintOptions {
  return {
    copies: {
      ...DEFAULT_PRINT_OPTIONS.copies,
      ...(raw?.copies ?? {}),
    },
    max_attempts: {
      ...DEFAULT_PRINT_OPTIONS.max_attempts,
      ...(raw?.max_attempts ?? {}),
    },
  };
}

export async function fetchPrintOptions(db: PrintDB): Promise<PrintOptions> {
  try {
    const result = await db.query(
      `SELECT values FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: PRINT_OPTIONS_KEY }
    );
    const rows = firstRows<{ values?: PrintOptions }>(result);
    return normalizePrintOptions(rows[0]?.values);
  } catch {
    return normalizePrintOptions(null);
  }
}

export function canPrintWithoutOverride(count: number, limit: number): boolean {
  return limit <= 0 || count < limit;
}

export async function countOrderPrints(
  db: PrintDB,
  orderId: string,
  printType: OrderPrintType
): Promise<number> {
  const result = await db.query(
    `SELECT count() AS total FROM ${Tables.order_prints} WHERE order = $order AND print_type = $printType GROUP ALL`,
    { order: toRecordId(orderId), printType }
  );
  const rows = firstRows<{ total?: number }>(result);
  return Number(rows[0]?.total ?? 0);
}

export async function hasTempPrint(db: PrintDB, orderId: string): Promise<boolean> {
  const count = await countOrderPrints(db, orderId, "temp");
  return count > 0;
}

/** Returns set of order id strings that have at least one temp print. */
export async function batchOrdersWithTempPrint(
  db: PrintDB,
  orderIds: string[]
): Promise<Set<string>> {
  const ids = orderIds.filter(Boolean);
  if (ids.length === 0) return new Set();

  const result = await db.query(
    `SELECT order FROM ${Tables.order_prints} WHERE order IN $orders AND print_type = 'temp'`,
    { orders: ids.map((id) => toRecordId(id)) }
  );
  const rows = firstRows<{ order?: { toString?: () => string } | string }>(result);
  const set = new Set<string>();
  for (const row of rows) {
    const id = typeof row?.order === "string"
      ? row.order
      : row?.order?.toString?.() ?? String(row?.order ?? "");
    if (id) set.add(id);
  }
  return set;
}

export async function recordOrderPrint(
  db: PrintDB,
  opts: {
    orderId: string;
    printType: OrderPrintType;
    userId?: string | null;
    isOverride?: boolean;
    isDuplicate?: boolean;
  }
): Promise<void> {
  try {
    await db.create(Tables.order_prints, {
      order: toRecordId(opts.orderId),
      print_type: opts.printType,
      printed_by: opts.userId ? toRecordId(opts.userId) : null,
      is_override: opts.isOverride === true,
      is_duplicate: opts.isDuplicate === true,
    });
  } catch (e) {
    console.error("Failed to record order print", e);
    toast.error(i18n.t("toast:print.recordFailed"));
  }
}

export type BillPrintGate = {
  allowedWithoutOverride: boolean;
  count: number;
  limit: number;
};

export async function getBillPrintGate(
  db: PrintDB,
  orderId: string,
  printType: OrderPrintType
): Promise<BillPrintGate> {
  const [options, count] = await Promise.all([
    fetchPrintOptions(db),
    countOrderPrints(db, orderId, printType),
  ]);
  const limit = printType === "temp" ? options.max_attempts.temp : options.max_attempts.final;
  return {
    allowedWithoutOverride: canPrintWithoutOverride(count, limit),
    count,
    limit,
  };
}

export function toastPrintLimitReached(
  printType: OrderPrintType,
  count: number,
  limit: number
): void {
  const key =
    printType === "temp" ? "toast:print.tempLimitReached" : "toast:print.finalLimitReached";
  toast.warning(i18n.t(key, { count, limit }));
}

type ProtectActionFn = (
  action: () => void,
  options: ProtectedActionOptions
) => void | Promise<void>;

/**
 * Gate temp/final bill prints by max_attempts, then protectAction + doPrint + record.
 * When skipIfOverLimit is true (background jobs), over-limit prints are skipped with a toast.
 */
export async function requestBillPrint(opts: {
  db: PrintDB;
  protectAction?: ProtectActionFn;
  orderId: string;
  printType: OrderPrintType;
  printModule: string;
  description: string;
  payload?: any;
  doPrint: () => Promise<boolean>;
  userId?: string | null;
  isDuplicate?: boolean;
  onPrinted?: () => void;
  skipIfOverLimit?: boolean;
}): Promise<boolean> {
  const gate = await getBillPrintGate(opts.db, opts.orderId, opts.printType);
  const isOverride = !gate.allowedWithoutOverride;

  if (isOverride) {
    toastPrintLimitReached(opts.printType, gate.count, gate.limit);
    if (opts.skipIfOverLimit) {
      return false;
    }
  }

  const run = async () => {
    const ok = await opts.doPrint();
    if (ok) {
      await recordOrderPrint(opts.db, {
        orderId: opts.orderId,
        printType: opts.printType,
        userId: opts.userId,
        isOverride,
        isDuplicate: opts.isDuplicate === true,
      });
      opts.onPrinted?.();
    }
    return ok;
  };

  if (!opts.protectAction) {
    return run();
  }

  const module = isOverride ? "Override print limit" : opts.printModule;
  const description = isOverride
    ? i18n.t("toast:print.overrideRequired")
    : opts.description;

  await opts.protectAction(
    () => {
      void run();
    },
    {
      module,
      description,
      payload: opts.payload,
      // Always prompt when over limit (even if the cashier somehow has the override module).
      forceAuth: isOverride,
      // Managers with Override print limit, or another user with the print permission, may approve.
      ...(isOverride
        ? {
            alternateModule: opts.printModule,
            excludeUserId: opts.userId ? String(opts.userId) : undefined,
          }
        : {}),
    }
  );

  return true;
}
