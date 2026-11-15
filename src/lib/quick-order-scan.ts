import type {Dish} from "@/api/model/dish.ts";
import {Tables} from "@/api/db/tables.ts";

const normalizeScanCode = (code: string): string => code.trim();

/** Primary + alias barcodes for a dish (trimmed, de-duped). */
export const collectDishBarcodeCodes = (
  dish: {
    barcode?: string | null;
    barcodes?: Array<string | null | undefined> | null;
  } | null | undefined,
): string[] => {
  const codes: string[] = [];
  const primary = typeof dish?.barcode === "string" ? dish.barcode.trim() : "";
  if (primary) {
    codes.push(primary);
  }
  for (const raw of dish?.barcodes ?? []) {
    const code = typeof raw === "string" ? raw.trim() : "";
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
};

const dishBarcodeList = (dish: Dish): string[] => collectDishBarcodeCodes(dish);

export type BarcodeCollision = {
  code: string;
  dishId: string;
  dishName: string;
};

/**
 * Find barcode codes that already belong to another dish in an in-memory catalog.
 * Same-dish codes (excludeDishId) are ignored.
 */
export function findBarcodeCollisions(
  codes: string[],
  dishes: Array<{
    id?: unknown;
    name?: string | null;
    barcode?: string | null;
    barcodes?: Array<string | null | undefined> | null;
  }> | null | undefined,
  excludeDishId?: string | null,
): BarcodeCollision[] {
  const wanted = [
    ...new Set(
      codes
        .map((c) => normalizeScanCode(String(c ?? "")))
        .filter(Boolean),
    ),
  ];
  if (!wanted.length || !dishes?.length) {
    return [];
  }

  const exclude = excludeDishId != null ? String(excludeDishId) : "";
  const out: BarcodeCollision[] = [];
  const reported = new Set<string>();

  for (const dish of dishes) {
    const id = dish?.id != null ? String(dish.id) : "";
    if (exclude && (id === exclude || id === `menu_item:${exclude}` || exclude === `menu_item:${id}`)) {
      continue;
    }
    const owned = new Set(collectDishBarcodeCodes(dish));
    for (const code of wanted) {
      if (!owned.has(code)) {
        continue;
      }
      const key = `${code}::${id}`;
      if (reported.has(key)) {
        continue;
      }
      reported.add(key);
      out.push({
        code,
        dishId: id,
        dishName: String(dish.name ?? id),
      });
    }
  }
  return out;
}

type DbLike = {
  query: (sql: string, vars?: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Query live menu_item rows for barcode / barcodes collisions.
 * Prefer this on save/import so offline cache staleness cannot miss a conflict.
 */
export async function queryBarcodeCollisions(
  db: DbLike,
  codes: string[],
  excludeDishIds?: Array<string | null | undefined> | null,
): Promise<BarcodeCollision[]> {
  const wanted = [
    ...new Set(
      codes
        .map((c) => normalizeScanCode(String(c ?? "")))
        .filter(Boolean),
    ),
  ];
  if (!wanted.length) {
    return [];
  }

  const excludeKeys = new Set(
    (excludeDishIds ?? [])
      .filter((id) => id != null && String(id).trim() !== "")
      .flatMap((id) => {
        const raw = String(id);
        return raw.startsWith("menu_item:")
          ? [raw, raw.slice("menu_item:".length)]
          : [raw, `menu_item:${raw}`];
      }),
  );

  const [rows] = (await db.query(
    `SELECT id, name, barcode, barcodes FROM ${Tables.dishes}
     WHERE barcode IN $codes
        OR array::len(array::intersect(barcodes ?? [], $codes)) > 0
     LIMIT 50`,
    {codes: wanted},
  )) as [Array<{id?: unknown; name?: string; barcode?: string | null; barcodes?: string[] | null}>];

  return findBarcodeCollisions(
    wanted,
    (rows ?? []).filter((row) => {
      const id = row?.id != null ? String(row.id) : "";
      return Boolean(id) && !excludeKeys.has(id);
    }),
  );
}

/**
 * Resolve a HID wedge / PLU scan against the hydrated dish catalog.
 * Prefer exact barcode match (primary or aliases); fall back to dish number (PLU).
 */
export function findDishByScanCode(
  dishes: Dish[] | undefined | null,
  rawCode: string,
): Dish | undefined {
  const code = normalizeScanCode(rawCode);
  if (!code || !dishes?.length) {
    return undefined;
  }

  const byBarcode = dishes.find((dish) => dishBarcodeList(dish).includes(code));
  if (byBarcode) {
    return byBarcode;
  }

  return dishes.find((dish) => {
    const number =
      typeof dish.number === "string"
        ? dish.number.trim()
        : String(dish.number ?? "").trim();
    return number.length > 0 && number === code;
  });
}

export type QuickOrderDishSuggestion = {
  dish: Dish;
  /** Lower is better (exact barcode/number first). */
  rank: number;
  matchedOn: "barcode" | "number" | "name";
};

const dishNumberText = (dish: Dish): string => {
  return typeof dish.number === "string"
    ? dish.number.trim()
    : String(dish.number ?? "").trim();
};

/**
 * Typeahead for Quick Order scan field: name, number (PLU), or barcode (primary/aliases).
 * Skips qty suffixes (`CODE*6`, `*6`) — those stay on the Enter/scan path.
 */
export function searchQuickOrderDishes(
  dishes: Dish[] | undefined | null,
  rawQuery: string,
  limit = 10,
): QuickOrderDishSuggestion[] {
  const query = normalizeScanCode(rawQuery);
  if (!query || !dishes?.length || query.includes("*")) {
    return [];
  }

  const q = query.toLowerCase();
  const scored: QuickOrderDishSuggestion[] = [];

  for (const dish of dishes) {
    if (dish.deleted_at) {
      continue;
    }
    const number = dishNumberText(dish);
    const numberLower = number.toLowerCase();
    const name = String(dish.name ?? "").trim();
    const nameLower = name.toLowerCase();
    const barcodes = dishBarcodeList(dish);
    const barcodeExact = barcodes.find((code) => code === query);
    const barcodePrefix = barcodes.find((code) => code.toLowerCase().startsWith(q));
    const barcodeIncludes = barcodes.find((code) => code.toLowerCase().includes(q));

    let rank: number | null = null;
    let matchedOn: QuickOrderDishSuggestion["matchedOn"] = "name";

    if (barcodeExact) {
      rank = 0;
      matchedOn = "barcode";
    } else if (number && number === query) {
      rank = 1;
      matchedOn = "number";
    } else if (numberLower && numberLower.startsWith(q)) {
      rank = 2;
      matchedOn = "number";
    } else if (barcodePrefix) {
      rank = 3;
      matchedOn = "barcode";
    } else if (nameLower && nameLower.startsWith(q)) {
      rank = 4;
      matchedOn = "name";
    } else if (nameLower && nameLower.includes(q)) {
      rank = 5;
      matchedOn = "name";
    } else if (barcodeIncludes) {
      rank = 6;
      matchedOn = "barcode";
    } else if (numberLower && numberLower.includes(q)) {
      rank = 7;
      matchedOn = "number";
    }

    if (rank == null) {
      continue;
    }
    scored.push({dish, rank, matchedOn});
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return String(a.dish.name ?? "").localeCompare(String(b.dish.name ?? ""));
  });

  return scored.slice(0, Math.max(1, limit));
}

export type ParsedScanQty = {
  /** Null when using last-added dish (`*N`) or on parse error. */
  code: string | null;
  qty: number;
  /** `use_last` = bare `*N`; `invalid_qty` / `empty` = reject. */
  mode: "code" | "use_last" | "invalid_qty" | "empty";
};

/**
 * Parse retail scan input:
 * - `UPC` → code, qty 1
 * - `UPC*6` → code, qty 6
 * - `*6` → use last dish, qty 6
 */
export function parseScanQty(raw: string): ParsedScanQty {
  const trimmed = normalizeScanCode(raw);
  if (!trimmed) {
    return {code: null, qty: 1, mode: "empty"};
  }

  const starOnly = trimmed.match(/^\*(\d+)$/);
  if (starOnly) {
    const qty = Number(starOnly[1]);
    if (!Number.isInteger(qty) || qty < 1) {
      return {code: null, qty: 1, mode: "invalid_qty"};
    }
    return {code: null, qty, mode: "use_last"};
  }

  const starIdx = trimmed.lastIndexOf("*");
  if (starIdx > 0) {
    const code = trimmed.slice(0, starIdx).trim();
    const qtyStr = trimmed.slice(starIdx + 1).trim();
    const qty = Number(qtyStr);
    if (!code || !Number.isInteger(qty) || qty < 1) {
      return {code: null, qty: 1, mode: "invalid_qty"};
    }
    return {code, qty, mode: "code"};
  }

  // Trailing * with no digits, or leading * with non-digits → invalid
  if (trimmed.includes("*")) {
    return {code: null, qty: 1, mode: "invalid_qty"};
  }

  return {code: trimmed, qty: 1, mode: "code"};
}

/** Normalize extra barcode strings for persist (trim, drop empties + primary dupes). */
export function normalizeExtraBarcodes(
  barcodes: unknown,
  primary?: string | null,
): string[] {
  const primaryTrim =
    typeof primary === "string" ? primary.trim() : String(primary ?? "").trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const list = Array.isArray(barcodes) ? barcodes : [];
  for (const raw of list) {
    const code = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    if (!code || code === primaryTrim || seen.has(code)) {
      continue;
    }
    seen.add(code);
    out.push(code);
  }
  return out;
}
