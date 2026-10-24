import type {Dish} from "@/api/model/dish.ts";

const normalizeScanCode = (code: string): string => code.trim();

/**
 * Resolve a HID wedge / PLU scan against the hydrated dish catalog.
 * Prefer exact barcode match; fall back to exact dish number (PLU).
 */
export function findDishByScanCode(
  dishes: Dish[] | undefined | null,
  rawCode: string,
): Dish | undefined {
  const code = normalizeScanCode(rawCode);
  if (!code || !dishes?.length) {
    return undefined;
  }

  const byBarcode = dishes.find((dish) => {
    const barcode = typeof dish.barcode === "string" ? dish.barcode.trim() : "";
    return barcode.length > 0 && barcode === code;
  });
  if (byBarcode) {
    return byBarcode;
  }

  return dishes.find((dish) => {
    const number = typeof dish.number === "string" ? dish.number.trim() : String(dish.number ?? "").trim();
    return number.length > 0 && number === code;
  });
}
