import {describe, expect, it} from "vitest";
import {findDishByScanCode} from "@/lib/quick-order-scan.ts";
import type {Dish} from "@/api/model/dish.ts";

const dish = (partial: Partial<Dish> & Pick<Dish, "id" | "name" | "number" | "price">): Dish =>
  partial as Dish;

describe("findDishByScanCode", () => {
  const catalog = [
    dish({id: "menu_item:1", name: "Cola", number: "101", barcode: "8901234567890", price: 2}),
    dish({id: "menu_item:2", name: "Bun", number: "202", barcode: null, price: 1}),
    dish({id: "menu_item:3", name: "Water", number: "303", barcode: "  111  ", price: 1}),
  ];

  it("matches barcode first", () => {
    expect(findDishByScanCode(catalog, "8901234567890")?.id).toBe("menu_item:1");
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
