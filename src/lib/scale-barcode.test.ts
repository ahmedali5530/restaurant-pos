import {describe, expect, it} from "vitest";
import {
  DEFAULT_SCALE_BARCODE_CONFIG,
  ean13CheckDigit,
  findDishByScalePlu,
  isValidEan13,
  parseScaleBarcode,
} from "@/lib/scale-barcode.ts";
import type {Dish} from "@/api/model/dish.ts";

/** Build a valid 13-digit code from the first 12 digits. */
const withCheck = (twelve: string): string => {
  const d = ean13CheckDigit(twelve);
  if (d == null) {
    throw new Error(`bad twelve: ${twelve}`);
  }
  return `${twelve}${d}`;
};

describe("ean13CheckDigit", () => {
  it("computes a valid check digit", () => {
    // 20 + PLU 12345 + 1250 g
    const code = withCheck("201234501250");
    expect(code).toHaveLength(13);
    expect(isValidEan13(code)).toBe(true);
  });
});

describe("parseScaleBarcode", () => {
  const enabled = {...DEFAULT_SCALE_BARCODE_CONFIG, enabled: true};

  it("returns null when disabled", () => {
    const code = withCheck("201234501250");
    expect(parseScaleBarcode(code, {...enabled, enabled: false})).toBeNull();
  });

  it("parses weight in grams to kg qty", () => {
    const code = withCheck("201234501250"); // PLU 12345, 1250 g
    const result = parseScaleBarcode(code, enabled);
    expect(result).toMatchObject({
      pluKey: "12345",
      valueMode: "weight_grams",
      quantity: 1.25,
      rawValue: 1250,
    });
  });

  it("parses price mode to priceOverride", () => {
    const code = withCheck("201234501250"); // 1250 minor → 12.50
    const result = parseScaleBarcode(code, {
      ...enabled,
      valueMode: "price_minor",
      priceDivisor: 100,
    });
    expect(result).toMatchObject({
      pluKey: "12345",
      valueMode: "price_minor",
      quantity: 1,
      priceOverride: 12.5,
    });
  });

  it("supports GS1-style 6-digit article after single 2", () => {
    const code = withCheck("212345601250"); // PLU 123456, 1250 g
    const result = parseScaleBarcode(code, {
      ...enabled,
      prefix: "2",
      pluStart: 1,
      pluLength: 6,
      valueStart: 7,
      valueLength: 5,
    });
    expect(result).toMatchObject({
      pluKey: "123456",
      quantity: 1.25,
    });
  });

  it("rejects wrong prefix and non-13 codes", () => {
    expect(parseScaleBarcode("3012345012501", enabled)).toBeNull();
    expect(parseScaleBarcode("12345", enabled)).toBeNull();
  });

  it("rejects bad check digit when validation on", () => {
    const twelve = "201234501250";
    const good = ean13CheckDigit(twelve)!;
    const badDigit = (good + 1) % 10;
    expect(parseScaleBarcode(`${twelve}${badDigit}`, enabled)).toBeNull();
  });
});

describe("findDishByScalePlu", () => {
  const dishes = [
    {id: "menu_item:1", name: "Mutton", number: "012345", price: 2000} as Dish,
    {id: "menu_item:2", name: "Chicken", number: "99", barcode: "00099", price: 800} as Dish,
  ];

  it("matches number ignoring leading zeros", () => {
    expect(findDishByScalePlu(dishes, "12345")?.name).toBe("Mutton");
    expect(findDishByScalePlu(dishes, "012345")?.name).toBe("Mutton");
  });

  it("matches barcode as PLU fallback", () => {
    expect(findDishByScalePlu(dishes, "99")?.name).toBe("Chicken");
  });
});
