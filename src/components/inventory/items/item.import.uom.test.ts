import {describe, expect, it} from "vitest";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {autoMapColumns} from "@/lib/data-import/extract/structured.ts";
import {createInventoryItemImportConfig} from "@/components/inventory/items/item.import.config.ts";

const t = (key: string, opts?: {defaultValue?: string}) =>
  opts?.defaultValue ?? key;

const db = {
  query: async () => [[]],
} as any;

describe("inventory item import UOM cleanse", () => {
  const config = createInventoryItemImportConfig({db, t});

  it("maps Unit of measurement header to uom", () => {
    const mapping = autoMapColumns(
      [
        "Name",
        "Code",
        "Category",
        "Unit of measurement",
        "Unit price",
      ],
      config.fields
    );
    expect(mapping.uom).toBe("Unit of measurement");
    expect(mapping.price).toBe("Unit price");
    expect(mapping.base_quantity).toBeUndefined();
  });

  it("normalizes UOM synonyms", () => {
    const [row] = normalizeRecords(config, [
      {
        name: "MILO",
        code: "M1",
        category: "PAN SHOP",
        uom: "pac",
        price: 0,
        locations: "Main",
        suppliers: "Vendor",
      },
    ]);
    expect(row.values.uom).toBe("PK");
  });

  it("clears numeric pack-size UOM values", () => {
    const [row] = normalizeRecords(config, [
      {
        name: "SHEZAN",
        code: "SZ1",
        category: "PAN SHOP",
        uom: "24",
        price: 150,
        locations: "Main",
        suppliers: "Vendor",
      },
    ]);
    expect(row.values.uom).toBe("");
  });
});
