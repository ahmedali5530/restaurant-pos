import { describe, it, expect } from "vitest";
import { allocatePurchaseCosts } from "@/lib/inventory/purchase-cost/allocate.ts";
import {
  inferCategoryFromName,
  normalizePurchaseExtra,
} from "@/lib/inventory/purchase-cost/normalize.ts";
import { DEFAULT_INVENTORY_SETTINGS } from "@/api/model/inventory_settings.ts";
import { roundCurrency } from "@/lib/discount-engine/rounding.ts";

const settings = { ...DEFAULT_INVENTORY_SETTINGS };

describe("normalizePurchaseExtra", () => {
  it("infers category from legacy name", () => {
    expect(inferCategoryFromName("Ocean Freight")).toBe("Freight");
    expect(inferCategoryFromName("Supplier Discount")).toBe("Discount");
    expect(inferCategoryFromName("VAT")).toBe("Tax");
  });

  it("normalizes legacy {name,amount} with capitalize default", () => {
    const n = normalizePurchaseExtra({ name: "Shipping", amount: 40 }, settings);
    expect(n?.category).toBe("Shipping");
    expect(n?.inventory_treatment).toBe("capitalize");
    expect(n?.allocation_method).toBe("by_value");
    expect(n?.amount).toBe(40);
  });

  it("stores discount as negative amount", () => {
    const n = normalizePurchaseExtra(
      { name: "Discount", amount: 10, category: "Discount" },
      settings
    );
    expect(n?.amount).toBe(-10);
  });
});

describe("allocatePurchaseCosts", () => {
  it("allocates shipping by value: 100kg @ 8 + shipping 40 → final 8.40", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "line:1", quantity: 100, price: 8 }],
      extras: [{ name: "Shipping", amount: 40, category: "Shipping" }],
      tax_rate: 0,
      settings,
    });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].purchase_price).toBe(8);
    expect(result.lines[0].allocated_extra_cost).toBe(0.4);
    expect(result.lines[0].final_unit_cost).toBe(8.4);
    expect(result.lines[0].total_inventory_cost).toBe(840);
    expect(result.summary.final_inventory_value).toBe(840);
  });

  it("allocates by value across two lines with exact sum", () => {
    const result = allocatePurchaseCosts({
      lines: [
        { id: "a", quantity: 10, price: 10 }, // value 100
        { id: "b", quantity: 10, price: 30 }, // value 300
      ],
      extras: [{ name: "Freight", amount: 40, category: "Freight" }],
      settings,
    });

    const a = result.lines.find((l) => l.purchase_item_id === "a")!;
    const b = result.lines.find((l) => l.purchase_item_id === "b")!;
    expect(roundCurrency(a.allocated_extra_total + b.allocated_extra_total)).toBe(40);
    // 100/400 * 40 = 10, 300/400 * 40 = 30
    expect(a.allocated_extra_total).toBe(10);
    expect(b.allocated_extra_total).toBe(30);
    expect(a.final_unit_cost).toBe(11); // (100+10)/10
    expect(b.final_unit_cost).toBe(33); // (300+30)/10
  });

  it("allocates by quantity", () => {
    const result = allocatePurchaseCosts({
      lines: [
        { id: "a", quantity: 1, price: 100 },
        { id: "b", quantity: 3, price: 10 },
      ],
      extras: [
        {
          name: "Handling",
          amount: 40,
          category: "Handling",
          allocation_method: "by_quantity",
        },
      ],
      settings,
    });

    const a = result.lines.find((l) => l.purchase_item_id === "a")!;
    const b = result.lines.find((l) => l.purchase_item_id === "b")!;
    expect(a.allocated_extra_total).toBe(10);
    expect(b.allocated_extra_total).toBe(30);
  });

  it("allocates equally", () => {
    const result = allocatePurchaseCosts({
      lines: [
        { id: "a", quantity: 1, price: 100 },
        { id: "b", quantity: 99, price: 1 },
      ],
      extras: [
        {
          name: "Misc",
          amount: 10,
          category: "Miscellaneous",
          allocation_method: "equal",
        },
      ],
      settings,
    });

    const a = result.lines.find((l) => l.purchase_item_id === "a")!;
    const b = result.lines.find((l) => l.purchase_item_id === "b")!;
    expect(a.allocated_extra_total).toBe(5);
    expect(b.allocated_extra_total).toBe(5);
  });

  it("handles rounding remainder so totals still match", () => {
    const result = allocatePurchaseCosts({
      lines: [
        { id: "a", quantity: 1, price: 10 },
        { id: "b", quantity: 1, price: 10 },
        { id: "c", quantity: 1, price: 10 },
      ],
      extras: [{ name: "Shipping", amount: 1, category: "Shipping" }],
      settings,
    });

    const sumExtras = roundCurrency(
      result.lines.reduce((s, l) => s + l.allocated_extra_total, 0)
    );
    expect(sumExtras).toBe(1);
    expect(result.summary.final_inventory_value).toBe(31);
  });

  it("applies negative discount to reduce final unit cost", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "a", quantity: 10, price: 10 }],
      extras: [{ name: "Discount", amount: 20, category: "Discount" }],
      settings,
    });

    expect(result.lines[0].allocated_discount_total).toBe(-20);
    expect(result.lines[0].final_unit_cost).toBe(8);
    expect(result.summary.capitalized_discount).toBe(-20);
  });

  it("capitalizes non-recoverable header tax", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "a", quantity: 10, price: 10, taxable: true }],
      tax_rate: 10,
      settings: { ...settings, default_purchase_tax_behavior: "non_recoverable" },
    });

    expect(result.summary.capitalized_tax).toBe(10);
    expect(result.lines[0].final_unit_cost).toBe(11);
  });

  it("excludes recoverable header tax from inventory", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "a", quantity: 10, price: 10, taxable: true }],
      tax_rate: 10,
      settings: { ...settings, default_purchase_tax_behavior: "recoverable" },
    });

    expect(result.summary.capitalized_tax).toBe(0);
    expect(result.lines[0].final_unit_cost).toBe(10);
    expect(result.summary.ignored_total).toBe(10);
  });

  it("excludes EXPENSE and IGNORE treatments from inventory", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "a", quantity: 10, price: 10 }],
      extras: [
        {
          name: "Env Fee",
          amount: 5,
          category: "Miscellaneous",
          inventory_treatment: "expense",
        },
        {
          name: "Note",
          amount: 3,
          category: "Miscellaneous",
          inventory_treatment: "ignore",
        },
        {
          name: "Shipping",
          amount: 20,
          category: "Shipping",
          inventory_treatment: "capitalize",
        },
      ],
      settings,
    });

    expect(result.summary.expense_total).toBe(5);
    expect(result.summary.ignored_total).toBe(3);
    expect(result.summary.capitalized_extras).toBe(20);
    expect(result.lines[0].final_unit_cost).toBe(12);
  });

  it("does not capitalize extras when landed costs disabled", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "a", quantity: 10, price: 10 }],
      extras: [{ name: "Shipping", amount: 40, category: "Shipping" }],
      settings: { ...settings, enable_landed_costs: false },
    });

    expect(result.summary.capitalized_extras).toBe(0);
    expect(result.lines[0].final_unit_cost).toBe(10);
  });

  it("does not capitalize discounts when purchase discounts disabled", () => {
    const result = allocatePurchaseCosts({
      lines: [{ id: "a", quantity: 10, price: 10 }],
      extras: [{ name: "Discount", amount: 20, category: "Discount" }],
      settings: { ...settings, enable_purchase_discounts: false },
    });

    expect(result.summary.capitalized_discount).toBe(0);
    expect(result.lines[0].final_unit_cost).toBe(10);
  });

  it("supports manual allocation", () => {
    const result = allocatePurchaseCosts({
      lines: [
        { id: "a", quantity: 1, price: 10 },
        { id: "b", quantity: 1, price: 10 },
      ],
      extras: [
        {
          name: "Customs",
          amount: 30,
          category: "Customs",
          allocation_method: "manual",
          manual_allocations: [
            { purchase_item_id: "a", amount: 10 },
            { purchase_item_id: "b", amount: 20 },
          ],
        },
      ],
      settings,
    });

    const a = result.lines.find((l) => l.purchase_item_id === "a")!;
    const b = result.lines.find((l) => l.purchase_item_id === "b")!;
    expect(a.allocated_extra_total).toBe(10);
    expect(b.allocated_extra_total).toBe(20);
  });
});
