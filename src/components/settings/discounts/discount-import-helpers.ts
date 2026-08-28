import {Tables} from "@/api/db/tables.ts";
import type {BuyXGetYCondition, DiscountSchedule, DiscountTargets} from "@/api/model/discount.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {DISCOUNT_CATEGORIES, STACKING_MODES, TAX_TREATMENTS} from "@/lib/discount-engine/types.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

const unwrapRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return [];
};

const parseStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,|;]/).map(part => part.trim()).filter(Boolean);
  }
  return [];
};

async function resolveIdsByNames(
  db: ImportDbLike,
  table: string,
  names: string[],
  searchFields: string[] = ["name"],
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    let found: unknown = null;
    for (const field of searchFields) {
      const rows = unwrapRows<{id: unknown}>(
        await db.query(
          `SELECT id FROM ${table}
           WHERE deleted_at = NONE AND string::lowercase(${field}) = string::lowercase($name)
           LIMIT 1`,
          {name},
        ),
      );
      if (rows[0]?.id) {
        found = rows[0].id;
        break;
      }
    }
    if (!found) {
      throw new Error(`${table} not found: ${name}`);
    }
    ids.push(recordToString(found));
  }
  return ids;
}

export async function resolveDiscountTargets(
  db: ImportDbLike,
  values: Record<string, unknown>,
): Promise<DiscountTargets | null> {
  const targets: DiscountTargets = {};

  const categoryNames = parseStringList(values.category_names);
  if (categoryNames.length) {
    targets.category_ids = await resolveIdsByNames(db, Tables.categories, categoryNames);
  }

  const itemNames = parseStringList(values.item_names);
  if (itemNames.length) {
    targets.item_ids = await resolveIdsByNames(db, Tables.dishes, itemNames, ["name", "number"]);
  }

  const floorNames = parseStringList(values.floor_names);
  if (floorNames.length) {
    targets.floor_ids = await resolveIdsByNames(db, Tables.floors, floorNames);
  }

  const customerTags = parseStringList(values.customer_tags);
  if (customerTags.length) {
    targets.customer_tags = customerTags;
  }

  const paymentTypeNames = parseStringList(values.payment_type_names);
  if (paymentTypeNames.length) {
    targets.payment_type_ids = await resolveIdsByNames(db, Tables.payment_types, paymentTypeNames);
  }

  return Object.keys(targets).length ? targets : null;
}

async function resolveTargetSubset(
  db: ImportDbLike,
  categoryKey: string,
  itemKey: string,
  values: Record<string, unknown>,
): Promise<{item_ids?: string[]; category_ids?: string[]}> {
  const subset: {item_ids?: string[]; category_ids?: string[]} = {};
  const categoryNames = parseStringList(values[categoryKey]);
  const itemNames = parseStringList(values[itemKey]);
  if (categoryNames.length) {
    subset.category_ids = await resolveIdsByNames(db, Tables.categories, categoryNames);
  }
  if (itemNames.length) {
    subset.item_ids = await resolveIdsByNames(db, Tables.dishes, itemNames, ["name", "number"]);
  }
  return subset;
}

export async function resolveBxgyConditions(
  db: ImportDbLike,
  values: Record<string, unknown>,
): Promise<BuyXGetYCondition | null> {
  const category = String(values.category ?? "").trim();
  if (category !== "buy_x_get_y") return null;

  const buyTargets = await resolveTargetSubset(db, "buy_category_names", "buy_item_names", values);
  const getTargets = await resolveTargetSubset(db, "get_category_names", "get_item_names", values);
  const getValueType = String(values.get_value_type ?? "free").trim() || "free";
  const rawValue = Number(values.get_value);
  const getValue = Number.isFinite(rawValue)
    ? rawValue
    : getValueType === "fixed_amount"
      ? 0
      : 100;

  return {
    buy_quantity: Math.max(1, Number(values.buy_quantity) || 1),
    get_quantity: Math.max(1, Number(values.get_quantity) || 1),
    buy_targets: buyTargets,
    get_targets: getTargets,
    get_value_type: getValueType as BuyXGetYCondition["get_value_type"],
    get_value: getValue,
  };
}

export function parseDiscountCategory(raw: unknown): string {
  const value = String(raw ?? "manual").trim().toLowerCase();
  if ((DISCOUNT_CATEGORIES as readonly string[]).includes(value)) return value;
  if (value === "bxgy" || value === "buy x get y") return "buy_x_get_y";
  throw new Error(`Invalid discount category: ${raw}`);
}

export function parseStackingMode(raw: unknown): string {
  const value = String(raw ?? "allow").trim().toLowerCase();
  if ((STACKING_MODES as readonly string[]).includes(value)) return value;
  return "allow";
}

export function parseTaxTreatment(raw: unknown): string {
  const value = String(raw ?? "tax_before_discount").trim().toLowerCase();
  if ((TAX_TREATMENTS as readonly string[]).includes(value)) return value;
  return "tax_before_discount";
}

export function parseSchedules(raw: unknown): DiscountSchedule[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.map(entry => {
    const row = entry as Record<string, unknown>;
    return {
      days_of_week: Array.isArray(row.days_of_week)
        ? row.days_of_week.map(day => Number(day)).filter(Number.isFinite)
        : [],
      months: Array.isArray(row.months)
        ? row.months.map(month => Number(month)).filter(Number.isFinite)
        : [],
      start_time: String(row.start_time ?? ""),
      end_time: String(row.end_time ?? ""),
      start_date: row.start_date ?? null,
      end_date: row.end_date ?? null,
    };
  });
}

export const parseImportBool = (value: unknown, defaultValue = false): boolean => {
  if (value === null || value === undefined || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return defaultValue;
};

/** Parse optional numeric import values; returns null when empty or unparseable. */
export const parseOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = String(value).trim().toLowerCase();
  if (["—", "-", "n/a", "na", "none", "null", "undefined", "nil"].includes(normalized)) {
    return null;
  }

  const cleaned = String(value).replace(/[^0-9.,\-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
