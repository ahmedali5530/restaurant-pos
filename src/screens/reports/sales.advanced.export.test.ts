import {describe, expect, it} from "bun:test";
import {
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
