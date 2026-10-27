import {describe, expect, it} from "vitest";
import {
  buildAvailabilityPatch,
  canAddDishQty,
  canAddModifierOptionQty,
  collectDishUsageInCart,
  countDishInModifierGroups,
  countOptionUnderParent,
  findCartAvailabilityViolations,
  findContextualCartAvailabilityViolations,
  getRemainingQty,
  isManuallyAvailable,
  qtyInCart,
  qtyOptionUnderParentInCart,
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

  it("counts cream used as a modifier toward cream cart qty", () => {
    const cream = {id: "menu_item:cream", name: "Cream"};
    const coffee = {id: "menu_item:coffee", name: "Coffee"};
    const cart = [
      {
        id: "line-1",
        quantity: 2,
        dish: coffee,
        selectedGroups: [
          {
            selectedModifiers: [{id: "m1", quantity: 1, dish: cream, level: 1}],
          },
        ],
      },
      {id: "line-2", quantity: 1, dish: cream},
    ] as any;
    // 2 (nested under coffee×2) + 1 standalone
    expect(qtyInCart(cart, "menu_item:cream")).toBe(3);
    expect(countDishInModifierGroups(cart[0].selectedGroups, "menu_item:cream", 2)).toBe(2);
    expect(collectDishUsageInCart(cart).get("menu_item:cream")).toBe(3);
  });

  it("blocks settle-style cart check when nested modifier exceeds limit", async () => {
    const cream = {
      id: "menu_item:cream",
      name: "Cream",
      available_qty: 1,
      available_qty_set_at: "2026-10-01T00:00:00.000Z",
    };
    const coffee = {id: "menu_item:coffee", name: "Coffee"};
    const cart = [
      {
        id: "line-1",
        quantity: 2,
        dish: coffee,
        selectedGroups: [
          {selectedModifiers: [{id: "m1", quantity: 1, dish: cream, level: 1}]},
        ],
      },
    ] as any;
    const violations = await findCartAvailabilityViolations({
      cart,
      catalogDishes: [cream, coffee] as any,
      soldByDishId: new Map(),
      enforceLimits: true,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].dishId).toBe("menu_item:cream");
    expect(violations[0].reason).toBe("limit");
  });

  it("counts contextual option only under the matching parent", () => {
    const large = {id: "menu_item:large"};
    const tikka = {id: "menu_item:tikka"};
    const margherita = {id: "menu_item:marg"};
    const cart = [
      {
        id: "a",
        quantity: 1,
        dish: tikka,
        selectedGroups: [
          {selectedModifiers: [{id: "m1", quantity: 1, dish: large, level: 1}]},
        ],
      },
      {
        id: "b",
        quantity: 1,
        dish: margherita,
        selectedGroups: [
          {selectedModifiers: [{id: "m2", quantity: 1, dish: large, level: 1}]},
        ],
      },
    ] as any;
    expect(qtyOptionUnderParentInCart(cart, "menu_item:tikka", "menu_item:large")).toBe(1);
    expect(qtyOptionUnderParentInCart(cart, "menu_item:marg", "menu_item:large")).toBe(1);
    expect(
      countOptionUnderParent(
        cart[0].selectedGroups,
        "menu_item:tikka",
        "menu_item:large",
        1,
        "menu_item:tikka",
      ),
    ).toBe(1);
  });

  it("blocks contextual Large on tikka while global Large remains sellable", async () => {
    const large = {id: "menu_item:large", name: "Large", available: true};
    const tikka = {id: "menu_item:tikka", name: "Tikka"};
    const check = canAddModifierOptionQty({
      parentDishId: "menu_item:tikka",
      optionDish: large as any,
      globalSold: 0,
      contextualSold: 0,
      cart: [],
      addQty: 1,
      enforceLimits: true,
      override: {id: "x", parent: "menu_item:tikka", option: "menu_item:large", available: false},
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("unavailable");

    const cart = [
      {
        id: "a",
        quantity: 1,
        dish: tikka,
        selectedGroups: [
          {selectedModifiers: [{id: "m1", quantity: 1, dish: large, level: 1}]},
        ],
      },
    ] as any;
    const violations = await findContextualCartAvailabilityViolations({
      cart,
      overrides: [
        {
          id: "ov1",
          parent: "menu_item:tikka",
          option: "menu_item:large",
          available: false,
        },
      ],
      catalogDishes: [large, tikka] as any,
      contextualSoldByKey: new Map(),
      enforceLimits: true,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe("unavailable");
  });

  it("enforces contextual sale limit under one parent only", () => {
    const large = {id: "menu_item:large", name: "Large", available: true};
    const result = canAddModifierOptionQty({
      parentDishId: "menu_item:tikka",
      optionDish: large as any,
      globalSold: 0,
      contextualSold: 1,
      cart: [],
      addQty: 1,
      enforceLimits: true,
      override: {
        id: "x",
        parent: "menu_item:tikka",
        option: "menu_item:large",
        available: true,
        available_qty: 1,
        available_qty_set_at: "2026-10-01T00:00:00.000Z",
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("limit");
    expect(result.remaining).toBe(0);
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
