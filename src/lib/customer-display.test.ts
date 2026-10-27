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
    expect(snap.lines[0].lineTotal).toBe(10);
    expect(snap.itemsBase).toBe(10);
    expect(snap.total).toBe(10);
    expect(snap.taxTotals).toEqual([]);
  });

  it("mirrors CartTotals tax-inclusive total from system taxes", () => {
    const cart = [
      {
        id: "a",
        quantity: 2,
        dish: {id: "menu_item:1", name: "Cola", price: 10},
        price: 10,
        newOrOld: MenuItemType.new,
      },
    ] as unknown as MenuItem[];

    const snap = buildCustomerDisplaySnapshot(cart, {
      taxes: [{id: "tax:gst", name: "GST", rate: 10} as any],
    });

    // Base 20 + 10% = 22
    expect(snap.itemsBase).toBe(20);
    expect(snap.taxTotals).toHaveLength(1);
    expect(snap.taxTotals[0].name).toBe("GST");
    expect(snap.taxTotals[0].rate).toBe(10);
    expect(snap.taxTotals[0].taxAmount).toBe(2);
    expect(snap.taxTotals[0].total).toBe(22);
    expect(snap.total).toBe(22);
  });

  it("flags thank you when requested", () => {
    expect(buildCustomerDisplaySnapshot([], {thankYou: true}).thankYou).toBe(true);
  });
});
