import {describe, expect, it} from "vitest";
import {
  looksLikeNumericPackSize,
  normalizeUom,
  parseQuantityWithOptionalUom,
} from "@/utils/inventoryUom.ts";

describe("parseQuantityWithOptionalUom", () => {
  it("parses quantity with PAC/pack unit", () => {
    expect(parseQuantityWithOptionalUom("1 PAC")).toEqual({
      quantity: 1,
      uom: "PK",
      rawUom: "PAC",
    });
    expect(parseQuantityWithOptionalUom("4PAC")).toEqual({
      quantity: 4,
      uom: "PK",
      rawUom: "PAC",
    });
    expect(parseQuantityWithOptionalUom("2 PAC")).toMatchObject({
      quantity: 2,
      uom: "PK",
    });
  });

  it("parses bare numbers", () => {
    expect(parseQuantityWithOptionalUom("12")).toEqual({
      quantity: 12,
      uom: null,
      rawUom: null,
    });
  });
});

describe("normalizeUom pac alias", () => {
  it("maps PAC to PK", () => {
    expect(normalizeUom("PAC")).toBe("PK");
    expect(normalizeUom("pac")).toBe("PK");
  });
});

describe("looksLikeNumericPackSize", () => {
  it("detects pack-size numbers vs unit codes", () => {
    expect(looksLikeNumericPackSize("24")).toBe(true);
    expect(looksLikeNumericPackSize(48)).toBe(true);
    expect(looksLikeNumericPackSize("PK")).toBe(false);
    expect(looksLikeNumericPackSize("1 PAC")).toBe(false);
  });
});
