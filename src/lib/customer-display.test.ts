import {describe, expect, it} from "vitest";
import {buildCustomerDisplaySnapshot} from "@/lib/customer-display.ts";
import type {MenuItem} from "@/api/model/cart_item.ts";
import {MenuItemType} from "@/api/model/cart_item.ts";

describe("buildCustomerDisplaySnapshot", () => {
  it("maps live cart lines and totals", () => {
    const cart = [
      {
        id: "a",
        quantity: 2,
        dish: {id: "menu_item:1", name: "Cola", price: 5},
        price: 5,
        newOrOld: MenuItemType.new,
      },
      {
        id: "b",
        quantity: 1,
        dish: {id: "menu_item:2", name: "Bun", price: 3},
        price: 3,
        newOrOld: MenuItemType.new,
        deleted_at: new Date(),
      },
    ] as unknown as MenuItem[];

    const snap = buildCustomerDisplaySnapshot(cart);
    expect(snap.lines).toHaveLength(1);
    expect(snap.lines[0].name).toBe("Cola");
    expect(snap.lines[0].quantity).toBe(2);
    expect(snap.total).toBeGreaterThan(0);
  });

  it("flags thank you when requested", () => {
    expect(buildCustomerDisplaySnapshot([], {thankYou: true}).thankYou).toBe(true);
  });
});
