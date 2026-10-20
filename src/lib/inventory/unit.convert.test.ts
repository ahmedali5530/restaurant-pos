import {describe, expect, it} from "vitest";
import {allocatePurchaseCosts} from "@/lib/inventory/purchase-cost/allocate.ts";
import {DEFAULT_INVENTORY_SETTINGS} from "@/api/model/inventory_settings.ts";
import {roundCurrency} from "@/lib/discount-engine/rounding.ts";
import {purchasePostingStrategy} from "@/lib/inventory/posting.strategies.ts";
import {
  purchaseReportQuantity,
  stockLineMoneyMatchesEntered,
  toStockLine,
  UnitConversionError,
} from "@/lib/inventory/unit.convert.ts";
import {convertQuantity} from "@/utils/inventoryUom.ts";
import {
  DEFAULT_INVENTORY_UOM_SEED,
  setInventoryUomCatalog,
} from "@/lib/inventory/uom.catalog.ts";
import type {InventoryUomRecord} from "@/api/model/inventory_uom.ts";

const settings = {...DEFAULT_INVENTORY_SETTINGS};

function withCatalog(records: InventoryUomRecord[], run: () => void) {
  setInventoryUomCatalog(records);
  try {
    run();
  } finally {
    setInventoryUomCatalog([...DEFAULT_INVENTORY_UOM_SEED]);
  }
}

describe("toStockLine commercial", () => {
  it("converts 16 kg @ 500/kg into 16000 g @ 0.5 when stock is G", () => {
    const line = toStockLine({
      enteredQuantity: 16,
      enteredUom: "KG",
      stockUom: "G",
      enteredPrice: 500,
      mode: "commercial",
    });
    expect(line.quantity).toBe(16000);
    expect(line.price).toBe(0.5);
    expect(roundCurrency(line.quantity * line.price)).toBe(8000);
    expect(stockLineMoneyMatchesEntered(line)).toBe(true);
    expect(line.entered_quantity).toBe(16);
    expect(line.entered_uom).toBe("KG");
    expect(line.entered_price).toBe(500);
  });

  it("keeps currency total for 16 kg @ 333/kg", () => {
    const line = toStockLine({
      enteredQuantity: 16,
      enteredUom: "KG",
      stockUom: "G",
      enteredPrice: 333,
      mode: "commercial",
    });
    expect(roundCurrency(line.quantity * line.price)).toBe(5328);
    expect(stockLineMoneyMatchesEntered(line)).toBe(true);
  });

  it("posts ledger quantity_change 16000 and total_cost 8000", () => {
    const line = toStockLine({
      enteredQuantity: 16,
      enteredUom: "KG",
      stockUom: "G",
      enteredPrice: 500,
      mode: "commercial",
    });
    const entries = purchasePostingStrategy.buildEntries(
      {
        id: "inventory_purchase:1",
        created_at: new Date().toISOString(),
      } as any,
      [
        {
          id: "inventory_purchase_item:1",
          item: {id: "inventory_item:ghee"},
          location: {id: "inventory_location:1"},
          quantity: line.quantity,
          price: line.price,
          final_unit_cost: line.price,
        } as any,
      ]
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].quantity_change).toBe(16000);
    expect(entries[0].unit_cost).toBe(0.5);
    expect(entries[0].total_cost).toBe(8000);
  });

  it("landed cost on 16000 × 0.5 plus Rs 80 extra totals 8080", () => {
    const line = toStockLine({
      enteredQuantity: 16,
      enteredUom: "KG",
      stockUom: "G",
      enteredPrice: 500,
      mode: "commercial",
    });
    const result = allocatePurchaseCosts({
      lines: [{id: "line:1", quantity: line.quantity, price: line.price}],
      extras: [{name: "Shipping", amount: 80, category: "Shipping"}],
      tax_rate: 0,
      settings,
    });
    expect(result.summary.final_inventory_value).toBe(8080);
    const allocated = result.lines[0];
    // Posting prefers total_inventory_cost; 2-dp unit cost can drift (0.505 → 0.51).
    expect(allocated.total_inventory_cost).toBe(8080);
    expect(allocated.purchase_price).toBe(0.5);
  });
});

describe("toStockLine quantity_only", () => {
  it("converts 160 g to 0.16 when stock is KG without dividing cost", () => {
    const line = toStockLine({
      enteredQuantity: 160,
      enteredUom: "G",
      stockUom: "KG",
      stockUnitPrice: 500,
      mode: "quantity_only",
    });
    expect(line.quantity).toBe(0.16);
    expect(line.price).toBe(500);
  });

  it("purchase return of 1 kg against 0.5/g keeps price 0.5", () => {
    const line = toStockLine({
      enteredQuantity: 1,
      enteredUom: "KG",
      stockUom: "G",
      stockUnitPrice: 0.5,
      mode: "quantity_only",
    });
    expect(line.quantity).toBe(1000);
    expect(line.price).toBe(0.5);
    expect(roundCurrency(line.quantity * line.price)).toBe(500);
  });

  it("dish recipe 160 g at updated item price 0.5 costs 80", () => {
    const line = toStockLine({
      enteredQuantity: 160,
      enteredUom: "G",
      stockUom: "G",
      stockUnitPrice: 0.5,
      mode: "quantity_only",
    });
    expect(line.quantity * line.price).toBe(80);
  });

  it("maps commercial 500/kg update to stock price 0.5 not 500", () => {
    const commercial = toStockLine({
      enteredQuantity: 16,
      enteredUom: "KG",
      stockUom: "G",
      enteredPrice: 500,
      mode: "commercial",
    });
    expect(commercial.price).toBe(0.5);
    expect(commercial.price).not.toBe(500);
  });
});

describe("purchaseReportQuantity", () => {
  it("multiplies legacy lines by base_quantity", () => {
    expect(
      purchaseReportQuantity({quantity: 16, base_quantity: 1000})
    ).toBe(16000);
  });

  it("does not multiply converted lines that have entered_uom", () => {
    expect(
      purchaseReportQuantity({
        quantity: 16000,
        base_quantity: 1000,
        entered_uom: "KG",
      })
    ).toBe(16000);
  });
});

describe("catalog-driven conversions", () => {
  it("converts custom TIN (5000 ml) to litres", () => {
    withCatalog(
      [
        ...DEFAULT_INVENTORY_UOM_SEED,
        {
          code: "TIN",
          name: "Tin",
          family: "volume",
          base_factor: 5000,
          is_system: false,
          is_active: true,
          sort: 900,
        },
      ],
      () => {
        expect(convertQuantity(1, "TIN", "L")).toBeCloseTo(5, 10);
        expect(convertQuantity(2, "TIN", "ML")).toBe(10000);
      }
    );
  });

  it("uses an edited GAL factor for litre conversion", () => {
    const edited = DEFAULT_INVENTORY_UOM_SEED.map((u) =>
      u.code === "GAL" ? {...u, base_factor: 4546.09} : {...u}
    );
    withCatalog(edited, () => {
      expect(convertQuantity(1, "GAL", "L")).toBeCloseTo(4.54609, 5);
      expect(convertQuantity(5, "L", "GAL")).toBeCloseTo(5 / 4.54609, 5);
    });
  });
});

describe("imperial US customary conversions", () => {
  it("converts 1 lb to grams", () => {
    expect(convertQuantity(1, "LB", "G")).toBeCloseTo(453.59237, 5);
  });

  it("converts 16 oz to 1 lb", () => {
    expect(convertQuantity(16, "OZ", "LB")).toBeCloseTo(1, 10);
  });

  it("converts 1 gal to litres", () => {
    expect(convertQuantity(1, "GAL", "L")).toBeCloseTo(3.785411784, 6);
  });

  it("converts 1 gal commercial into stock ML with money preserved", () => {
    const line = toStockLine({
      enteredQuantity: 1,
      enteredUom: "GAL",
      stockUom: "ML",
      enteredPrice: 378.5411784,
      mode: "commercial",
    });
    expect(line.quantity).toBeCloseTo(3785.411784, 5);
    expect(stockLineMoneyMatchesEntered(line)).toBe(true);
  });

  it("fails closed on OZ (weight) to FLOZ (volume)", () => {
    expect(() =>
      toStockLine({
        enteredQuantity: 1,
        enteredUom: "OZ",
        stockUom: "FLOZ",
        enteredPrice: 1,
        mode: "commercial",
      })
    ).toThrow(UnitConversionError);
  });
});

describe("convertQuantity precision and failures", () => {
  it("converts 0.1 kg to 100 g", () => {
    expect(convertQuantity(0.1, "KG", "G")).toBe(100);
    const line = toStockLine({
      enteredQuantity: 0.1,
      enteredUom: "KG",
      stockUom: "G",
      enteredPrice: 10,
      mode: "commercial",
    });
    expect(line.quantity).toBe(100);
  });

  it("fails closed on KG to ML", () => {
    expect(() =>
      toStockLine({
        enteredQuantity: 1,
        enteredUom: "KG",
        stockUom: "ML",
        enteredPrice: 1,
        mode: "commercial",
      })
    ).toThrow(UnitConversionError);
  });

  it("fails closed on PK to PC", () => {
    expect(() =>
      toStockLine({
        enteredQuantity: 1,
        enteredUom: "PK",
        stockUom: "PC",
        enteredPrice: 1,
        mode: "commercial",
      })
    ).toThrow(UnitConversionError);
  });

  it("fails closed on unknown unit", () => {
    expect(() =>
      toStockLine({
        enteredQuantity: 1,
        enteredUom: "BOX",
        stockUom: "G",
        enteredPrice: 1,
        mode: "commercial",
      })
    ).toThrow(UnitConversionError);
  });

  it("buildEntries does not convert on its own — invalid typed line would post typed qty", () => {
    // Guard: posting strategies must receive already-converted stock quantities.
    const entries = purchasePostingStrategy.buildEntries(
      {
        id: "inventory_purchase:2",
        created_at: new Date().toISOString(),
      } as any,
      [
        {
          id: "inventory_purchase_item:2",
          item: {id: "inventory_item:ghee"},
          location: {id: "inventory_location:1"},
          // Mistakenly saved as 16 (kg) without conversion — posting would use 16.
          quantity: 16,
          price: 500,
        } as any,
      ]
    );
    expect(entries[0].quantity_change).toBe(16);
    expect(entries[0].total_cost).toBe(8000);
  });
});
