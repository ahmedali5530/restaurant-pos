import {describe, expect, it} from "bun:test";
import {
  buildAdvancedSalesOrdersSheet,
  calculateAdvancedSalesOrderTotals,
  formatAdvancedSalesItemName,
} from "@/screens/reports/sales.advanced.export.ts";

describe("formatAdvancedSalesItemName", () => {
  it("includes dish name, comment, and modifiers", () => {
    const label = formatAdvancedSalesItemName({
      item: {name: "Burger"},
      comments: "no onion",
      modifiers: [
        {
          selectedModifiers: [
            {dish: {name: "Cheese"}},
            {dish: {name: "Bacon"}},
          ],
        },
      ],
    } as any);

    expect(label).toBe("Burger (no onion) [Cheese, Bacon]");
  });

  it("falls back to Unknown without a dish", () => {
    expect(formatAdvancedSalesItemName({} as any)).toBe("Unknown");
  });
});

describe("calculateAdvancedSalesOrderTotals", () => {
  it("counts items and reports collected payments", () => {
    const totals = calculateAdvancedSalesOrderTotals({
      covers: 2,
      tip_amount: 5,
      service_charge_amount: 3,
      items: [
        {quantity: 2, price: 10, tax_included: false, deleted_at: null},
        {quantity: 1, price: 5, tax_included: false, deleted_at: null},
      ],
      payments: [
        {amount: 30, payment_type: {type: "cash", name: "Cash"}},
      ],
    } as any);

    expect(totals.itemsCount).toBe(3);
    expect(totals.covers).toBe(2);
    expect(totals.tips).toBe(5);
    expect(totals.amountCollected).toBe(30);
    expect(totals.net).toBe(totals.amountCollected - totals.serviceCharges - totals.taxes);
  });
});

describe("buildAdvancedSalesOrdersSheet", () => {
  it("places item rows directly under each order when showMenuItems is on", () => {
    const {rows} = buildAdvancedSalesOrdersSheet({
      showInclusive: false,
      filters: {showMenuItems: true, showDetails: false},
      orders: [
        {
          id: "order:1",
          auto_id: 10,
          invoice_number: 100,
          created_at: "2026-11-01T12:00:00.000Z",
          status: "Paid",
          user: {first_name: "Ada", last_name: "Lovelace"},
          items: [
            {item: {name: "Burger"}, quantity: 1, price: 10, discount: 0},
            {item: {name: "Fries"}, quantity: 2, price: 3, discount: 0},
          ],
          payments: [{amount: 16, payment_type: {type: "cash", name: "Cash"}}],
        },
      ] as any,
    });

    expect(rows[0][0]).toBe("Row");
    expect(rows[0]).toContain("Item");
    expect(rows.map((r) => r[0])).toEqual(["Row", "Order", "Item", "Item"]);
    expect(rows[1][3]).toBe(10);
    expect(rows[2][rows[0].indexOf("Item")]).toBe("Burger");
    expect(rows[3][rows[0].indexOf("Item")]).toBe("Fries");
    // Order money stays only on the Order row.
    expect(rows[1][rows[0].indexOf("Net")]).toBeTypeOf("number");
    expect(rows[2][rows[0].indexOf("Net")]).toBe("");
  });
});
