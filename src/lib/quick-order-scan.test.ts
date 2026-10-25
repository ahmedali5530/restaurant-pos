import {describe, expect, it} from "vitest";
import {
  findBarcodeCollisions,
  findDishByScanCode,
  normalizeExtraBarcodes,
  parseScanQty,
} from "@/lib/quick-order-scan.ts";
import type {Dish} from "@/api/model/dish.ts";

const dish = (partial: Partial<Dish> & Pick<Dish, "id" | "name" | "number" | "price">): Dish =>
  partial as Dish;

describe("findDishByScanCode", () => {
  const catalog = [
    dish({id: "menu_item:1", name: "Cola", number: "101", barcode: "8901234567890", price: 2}),
    dish({id: "menu_item:2", name: "Bun", number: "202", barcode: null, price: 1}),
    dish({id: "menu_item:3", name: "Water", number: "303", barcode: "  111  ", price: 1}),
    dish({
      id: "menu_item:4",
      name: "Whisky",
      number: "404",
      barcode: "7501000000001",
      barcodes: ["7501000000002", " 7501000000003 "],
      price: 40,
    }),
  ];

  it("matches barcode first", () => {
    expect(findDishByScanCode(catalog, "8901234567890")?.id).toBe("menu_item:1");
  });

  it("matches additional barcodes", () => {
    expect(findDishByScanCode(catalog, "7501000000002")?.id).toBe("menu_item:4");
    expect(findDishByScanCode(catalog, "7501000000003")?.id).toBe("menu_item:4");
  });

  it("falls back to dish number when barcode missing", () => {
    expect(findDishByScanCode(catalog, "202")?.id).toBe("menu_item:2");
  });

  it("trims barcode and scan input", () => {
    expect(findDishByScanCode(catalog, "  111  ")?.id).toBe("menu_item:3");
  });

  it("returns undefined for unknown codes", () => {
    expect(findDishByScanCode(catalog, "999")).toBeUndefined();
  });

  it("returns undefined for empty catalog or code", () => {
    expect(findDishByScanCode([], "101")).toBeUndefined();
    expect(findDishByScanCode(catalog, "   ")).toBeUndefined();
  });
});

describe("parseScanQty", () => {
  it("parses plain code as qty 1", () => {
    expect(parseScanQty("8901")).toEqual({code: "8901", qty: 1, mode: "code"});
  });

  it("parses CODE*qty", () => {
    expect(parseScanQty("8901*6")).toEqual({code: "8901", qty: 6, mode: "code"});
    expect(parseScanQty("  PLU99 * 3 ")).toEqual({code: "PLU99", qty: 3, mode: "code"});
  });

  it("parses bare *qty as use_last", () => {
    expect(parseScanQty("*6")).toEqual({code: null, qty: 6, mode: "use_last"});
  });

  it("rejects invalid qty", () => {
    expect(parseScanQty("*0").mode).toBe("invalid_qty");
    expect(parseScanQty("A*").mode).toBe("invalid_qty");
    expect(parseScanQty("A*-1").mode).toBe("invalid_qty");
    expect(parseScanQty("A*1.5").mode).toBe("invalid_qty");
  });

  it("rejects empty", () => {
    expect(parseScanQty("   ").mode).toBe("empty");
  });
});

describe("normalizeExtraBarcodes", () => {
  it("trims, drops empties and primary duplicates", () => {
    expect(
      normalizeExtraBarcodes([" a ", "", "a", "b", "PRIMARY"], "PRIMARY"),
    ).toEqual(["a", "b"]);
  });
});

describe("findBarcodeCollisions", () => {
  const catalog = [
    dish({id: "menu_item:1", name: "Cola", number: "101", barcode: "8901", price: 2}),
    dish({
      id: "menu_item:2",
      name: "Whisky",
      number: "404",
      barcode: "7501",
      barcodes: ["7502", "7503"],
      price: 40,
    }),
  ];

  it("reports cross-dish primary and alias collisions", () => {
    const hits = findBarcodeCollisions(["8901", "7502"], catalog, "menu_item:99");
    expect(hits.map((h) => h.code).sort()).toEqual(["7502", "8901"]);
  });

  it("ignores the dish being edited", () => {
    expect(findBarcodeCollisions(["7501", "7502"], catalog, "menu_item:2")).toEqual([]);
  });

  it("returns empty when codes blank", () => {
    expect(findBarcodeCollisions([], catalog)).toEqual([]);
    expect(findBarcodeCollisions(["  "], catalog)).toEqual([]);
  });
});
