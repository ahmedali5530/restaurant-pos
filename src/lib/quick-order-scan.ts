import type {Dish} from "@/api/model/dish.ts";

const normalizeScanCode = (code: string): string => code.trim();

const dishBarcodeList = (dish: Dish): string[] => {
  const codes: string[] = [];
  const primary = typeof dish.barcode === "string" ? dish.barcode.trim() : "";
  if (primary) {
    codes.push(primary);
  }
  for (const raw of dish.barcodes ?? []) {
    const code = typeof raw === "string" ? raw.trim() : "";
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
};

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
