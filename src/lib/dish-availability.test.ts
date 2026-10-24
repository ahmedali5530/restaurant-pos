import {describe, expect, it} from "vitest";
import {
  buildAvailabilityPatch,
  canAddDishQty,
  getRemainingQty,
  isManuallyAvailable,
  qtyInCart,
  toAvailabilityMs,
  toAvailabilityStampIso,
  toLocalAvailabilityPatch,
} from "@/lib/dish-availability.ts";
import {DateTime as SurrealDateTime} from "surrealdb";

describe("dish-availability", () => {
  it("treats missing available as sellable", () => {
    expect(isManuallyAvailable({} as any)).toBe(true);
    expect(isManuallyAvailable({available: true} as any)).toBe(true);
    expect(isManuallyAvailable({available: false} as any)).toBe(false);
  });

  it("sums cart qty for a dish", () => {
    const cart = [
      {id: "a", quantity: 2, dish: {id: "menu_item:1"}},
      {id: "b", quantity: 1, dish: {id: "menu_item:2"}},
      {id: "c", quantity: 3, dish: {id: "menu_item:1"}, deleted_at: new Date()},
    ] as any;
    expect(qtyInCart(cart, "menu_item:1")).toBe(2);
  });

  it("computes remaining minus sold and cart", () => {
    const dish = {id: "menu_item:1", available_qty: 10} as any;
    const cart = [{id: "a", quantity: 2, dish}] as any;
    expect(getRemainingQty({dish, sold: 3, cart})).toBe(5);
    expect(getRemainingQty({dish: {id: "x"} as any, sold: 0, cart: []})).toBeNull();
  });

  it("blocks when manually unavailable even with remaining qty", () => {
    const dish = {id: "menu_item:1", available: false, available_qty: 5} as any;
    expect(canAddDishQty({dish, sold: 0, cart: [], addQty: 1}).ok).toBe(false);
    expect(canAddDishQty({dish, sold: 0, cart: [], addQty: 1}).reason).toBe("unavailable");
  });

  it("always blocks sold-out even when sale limits are disabled", () => {
    const dish = {id: "menu_item:1", available: false} as any;
    expect(
      canAddDishQty({dish, sold: 0, cart: [], addQty: 1, enforceLimits: false}).ok,
    ).toBe(false);
  });

  it("skips sale limits when enforceLimits is false", () => {
    const dish = {id: "menu_item:1", available_qty: 1} as any;
    const cart = [{id: "a", quantity: 1, dish}] as any;
    expect(
      canAddDishQty({dish, sold: 0, cart, addQty: 2, enforceLimits: false}).ok,
    ).toBe(true);
  });

  it("blocks when addQty exceeds remaining", () => {
    const dish = {id: "menu_item:1", available_qty: 3} as any;
    const result = canAddDishQty({dish, sold: 1, cart: [{id: "a", quantity: 1, dish}] as any, addQty: 2});
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(1);
    expect(result.reason).toBe("limit");
  });

  it("parses sale-window stamps and rejects empty Dexie clones", () => {
    const iso = "2026-10-23T12:00:00.000Z";
    expect(toAvailabilityMs(iso)).toBe(Date.parse(iso));
    expect(toAvailabilityMs(new SurrealDateTime(new Date(iso)))).toBe(Date.parse(iso));
    expect(toAvailabilityMs({})).toBeNull();
    expect(toAvailabilityStampIso(new SurrealDateTime(new Date(iso)))).toBe(iso);
    expect(
      toLocalAvailabilityPatch({
        available_qty: 1,
        available_qty_set_at: new SurrealDateTime(new Date(iso)),
      }).available_qty_set_at,
    ).toBe(iso);
  });

  it("stamps set_at when qty changes or is forced", () => {
    const stamped = buildAvailabilityPatch({
      available_qty: 5,
      previousQty: 3,
      now: new Date("2026-10-23T12:00:00.000Z"),
    });
    expect(stamped.available_qty).toBe(5);
    expect(stamped.available_qty_set_at).toBeTruthy();
    expect(typeof stamped.available_qty_set_at).not.toBe("string");

    const cleared = buildAvailabilityPatch({available_qty: null});
    expect(cleared.available_qty).toBeNull();
    expect(cleared.available_qty_set_at).toBeNull();

    const unchanged = buildAvailabilityPatch({
      available_qty: 5,
      previousQty: 5,
      now: new Date("2026-10-23T12:00:00.000Z"),
    });
    expect(unchanged.available_qty).toBe(5);
    expect(unchanged.available_qty_set_at).toBeUndefined();
  });
});
