import {describe, expect, it} from "bun:test";
import {
  aggregateDailyCategoryMix,
  getOrderItemModifierRows,
  sumFilteredExclusiveSales,
} from "@/api/reports/sales/aggregate.ts";

describe("getOrderItemModifierRows", () => {
  it("walks nested modifier groups with path and depth", () => {
    const rows = getOrderItemModifierRows([
      {
        selectedModifiers: [
          {
            dish: {name: "Cheese"},
            price: 1.5,
            selectedGroups: [
              {
                selectedModifiers: [{dish: {name: "Extra"}, price: 0.5}],
              },
            ],
          },
        ],
      },
    ]);

    expect(rows).toEqual([
      {name: "Cheese", depth: 1, path: "Cheese", quantity: 0, price: 1.5},
      {name: "Extra", depth: 2, path: "Cheese>Extra", quantity: 0, price: 0.5},
    ]);
  });
});

describe("aggregateDailyCategoryMix", () => {
  it("groups by item.category and dish name like Daily Sales Summary", () => {
    const categories = aggregateDailyCategoryMix([
      {
        items: [
          {
            category: "Mains",
            quantity: 2,
            price: 10,
            item: {name: "Burger", price: 10},
            modifiers: [
              {
                selectedModifiers: [{dish: {name: "Cheese"}, price: 1}],
              },
            ],
          },
          {
            category: "Mains",
            quantity: 1,
            price: 10,
            item: {name: "Burger", price: 10},
          },
        ],
        payments: [],
      },
    ] as any);

    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("Mains");
    expect(categories[0].quantity).toBe(3);
    expect(categories[0].dishes).toHaveLength(1);
    expect(categories[0].dishes[0].name).toBe("Burger");
    expect(categories[0].dishes[0].quantity).toBe(3);
    expect(categories[0].dishes[0].modifiers[0]?.name).toBe("Cheese");
    expect(categories[0].dishes[0].modifiers[0]?.quantity).toBe(2);
  });

  it("sumFilteredExclusiveSales matches mix totals when unfiltered", () => {
    const orders = [
      {
        items: [
          {category: "Drinks", quantity: 1, price: 5, item: {name: "Cola", price: 5}},
        ],
        payments: [],
      },
    ] as any;
    const mix = aggregateDailyCategoryMix(orders);
    const exclusive = sumFilteredExclusiveSales(orders);
    expect(exclusive).toBe(mix[0].total);
  });
});
