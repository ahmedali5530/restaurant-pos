import type {Dish} from "@/api/model/dish.ts";

/**
 * In-store / scale EAN-13 (butcher, bakery weigh–label).
 *
 * Default layout (common 13-digit in-store / scale sticker):
 *   2 0 P P P P P W W W W W C
 *   └─┬─┘ └──┬──┘ └──┬──┘ │
 *   prefix   PLU    value  check
 *
 * Weight mode: WWWWW = grams → qty kg = grams / weightDivisor (default 1000).
 * Price mode:  WWWWW = price in minor units → line price = value / priceDivisor.
 *
 * Scales that use a 6-digit article after a single "2" can set prefix "2",
 * pluLength 6, valueStart 7 in Settings.
 */

export type ScaleValueMode = "weight_grams" | "price_minor";

export type ScaleBarcodeConfig = {
  enabled: boolean;
  /** Code must start with this (e.g. "2" or "20"). */
  prefix: string;
  /** 0-based index of first PLU digit within the 13-digit body. */
  pluStart: number;
  pluLength: number;
  /** 0-based index of first value digit. */
  valueStart: number;
  valueLength: number;
  valueMode: ScaleValueMode;
  /** Grams → kg divisor (1000 → 01250 = 1.25 kg). */
  weightDivisor: number;
  /** Minor units → major currency (100 → 01250 = 12.50). */
  priceDivisor: number;
  validateCheckDigit: boolean;
};

export const DEFAULT_SCALE_BARCODE_CONFIG: ScaleBarcodeConfig = {
  enabled: false,
  prefix: "20",
  pluStart: 2,
  pluLength: 5,
  valueStart: 7,
  valueLength: 5,
  valueMode: "weight_grams",
  weightDivisor: 1000,
  priceDivisor: 100,
  validateCheckDigit: true,
};

export type ScaleBarcodeParseResult = {
  raw: string;
  plu: string;
  /** Normalized PLU without leading zeros (empty → "0"). */
  pluKey: string;
  valueMode: ScaleValueMode;
  /** Cart quantity (kg for weight mode, 1 for price mode). */
  quantity: number;
  /** When price mode: absolute unit price for the line. */
  priceOverride?: number;
  /** Raw embedded integer (grams or minor currency). */
  rawValue: number;
};

export const ean13CheckDigit = (twelveDigits: string): number | null => {
  if (!/^\d{12}$/.test(twelveDigits)) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(twelveDigits[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
};

export const isValidEan13 = (code: string): boolean => {
  if (!/^\d{13}$/.test(code)) {
    return false;
  }
  const expected = ean13CheckDigit(code.slice(0, 12));
  return expected != null && expected === Number(code[12]);
};

export const normalizePluKey = (plu: string): string => {
  const trimmed = plu.trim();
  if (!trimmed) {
    return "";
  }
  const stripped = trimmed.replace(/^0+/, "");
  return stripped.length ? stripped : "0";
};

export const normalizeScaleBarcodeConfig = (
  partial?: Partial<ScaleBarcodeConfig> | null,
): ScaleBarcodeConfig => {
  const base = {...DEFAULT_SCALE_BARCODE_CONFIG, ...(partial ?? {})};
  const prefix = String(base.prefix ?? "20").trim() || "20";
  const pluStart = Math.max(0, Math.min(12, Number(base.pluStart) || 0));
  const pluLength = Math.max(1, Math.min(12, Number(base.pluLength) || 5));
  const valueStart = Math.max(0, Math.min(12, Number(base.valueStart) || 7));
  const valueLength = Math.max(1, Math.min(12, Number(base.valueLength) || 5));
  const weightDivisor = Number(base.weightDivisor) > 0 ? Number(base.weightDivisor) : 1000;
  const priceDivisor = Number(base.priceDivisor) > 0 ? Number(base.priceDivisor) : 100;
  return {
    enabled: base.enabled === true,
    prefix,
    pluStart,
    pluLength,
    valueStart,
    valueLength,
    valueMode: base.valueMode === "price_minor" ? "price_minor" : "weight_grams",
    weightDivisor,
    priceDivisor,
    validateCheckDigit: base.validateCheckDigit !== false,
  };
};

/**
 * Parse a scale/in-store EAN-13. Returns null when disabled, wrong length,
 * prefix mismatch, bad check digit, or invalid layout/value.
 */
export function parseScaleBarcode(
  rawCode: string,
  configInput?: Partial<ScaleBarcodeConfig> | null,
): ScaleBarcodeParseResult | null {
  const config = normalizeScaleBarcodeConfig(configInput);
  if (!config.enabled) {
    return null;
  }

  const raw = String(rawCode ?? "").trim();
  if (!/^\d{13}$/.test(raw)) {
    return null;
  }
  if (!raw.startsWith(config.prefix)) {
    return null;
  }
  if (config.validateCheckDigit && !isValidEan13(raw)) {
    return null;
  }

  const pluEnd = config.pluStart + config.pluLength;
  const valueEnd = config.valueStart + config.valueLength;
  if (pluEnd > 12 || valueEnd > 12) {
    return null;
  }

  const plu = raw.slice(config.pluStart, pluEnd);
  const valueStr = raw.slice(config.valueStart, valueEnd);
  if (!/^\d+$/.test(plu) || !/^\d+$/.test(valueStr)) {
    return null;
  }

  const rawValue = Number(valueStr);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return null;
  }

  const pluKey = normalizePluKey(plu);
  if (!pluKey) {
    return null;
  }

  if (config.valueMode === "price_minor") {
    const price = rawValue / config.priceDivisor;
    if (!(price > 0)) {
      return null;
    }
    return {
      raw,
      plu,
      pluKey,
      valueMode: "price_minor",
      quantity: 1,
      priceOverride: Math.round(price * 100) / 100,
      rawValue,
    };
  }

  const quantity = rawValue / config.weightDivisor;
  if (!(quantity > 0)) {
    return null;
  }
  // Keep up to 3 decimal kg places (gram precision).
  const qty = Math.round(quantity * 1000) / 1000;
  return {
    raw,
    plu,
    pluKey,
    valueMode: "weight_grams",
    quantity: qty,
    rawValue,
  };
}

/** Match dish by PLU / number / primary barcode (leading zeros ignored on both sides). */
export function findDishByScalePlu(
  dishes: Dish[] | null | undefined,
  pluKey: string,
): Dish | undefined {
  const key = normalizePluKey(pluKey);
  if (!key || !dishes?.length) {
    return undefined;
  }

  return dishes.find((dish) => {
    const numberKey = normalizePluKey(String(dish.number ?? ""));
    if (numberKey && numberKey === key) {
      return true;
    }
    const barcodeKey = normalizePluKey(
      typeof dish.barcode === "string" ? dish.barcode : "",
    );
    if (barcodeKey && barcodeKey === key) {
      return true;
    }
    for (const extra of dish.barcodes ?? []) {
      if (normalizePluKey(String(extra ?? "")) === key) {
        return true;
      }
    }
    return false;
  });
}
