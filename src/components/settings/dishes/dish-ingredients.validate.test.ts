import {describe, expect, it} from "vitest";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {validateRecords} from "@/lib/data-import/validate.ts";
import {createDishIngredientsImportConfig} from "@/components/settings/dishes/dish-ingredients.import.config.ts";

const t = (key: string, opts?: {defaultValue?: string}) =>
  opts?.defaultValue ?? key;

describe("dish ingredients cleanse validation", () => {
  const makeDb = () => {
    const dishes = [
      {id: "menu_item:1", name: "Club Sandwich", number: "101"},
      {id: "menu_item:2", name: "Soup", number: "102"},
    ];
    const items = [
      {
        id: "inventory_item:flour",
        name: "Flour",
        code: "FLR",
        uom: "KG",
        item_types: ["raw"],
      },
      {
        id: "inventory_item:milk",
        name: "Milk",
        code: "MLK",
        uom: "L",
        item_types: ["raw"],
      },
    ];

    return {
      query: async (sql: string, vars?: Record<string, any>) => {
        if (sql.includes("FROM menu_item") && sql.includes("SELECT id, name, number")) {
          return [dishes];
        }
        if (sql.includes("FROM inventory_item") && sql.includes("id IN")) {
          const ids = (vars?.ids ?? []).map((id: any) => String(id));
          return [items.filter((item) => ids.includes(String(item.id)))];
        }
        if (sql.includes("FROM inventory_item")) {
          // resolve-refs candidate load
          return [items];
        }
        if (sql.includes("FROM menu_item")) {
          return [dishes];
        }
        return [[]];
      },
    } as any;
  };

  it("flags incompatible UOM (L on KG item)", async () => {
    const db = makeDb();
    const config = createDishIngredientsImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        dish_number: "101",
        ingredient: "Flour",
        uom: "L",
        quantity: 1,
      },
    ]);
    // Pre-resolve ingredient like resolve-refs would
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    const uomIssue = row.issues.find((i) => i.field === "uom" && i.severity === "error");
    expect(uomIssue?.code).toBe("cross_field");
    expect(uomIssue?.message).toMatch(/cannot convert|L|KG/i);
  });

  it("allows convertible UOM (G on KG item)", async () => {
    const db = makeDb();
    const config = createDishIngredientsImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        dish_number: "101",
        ingredient: "Flour",
        uom: "G",
        quantity: 250,
      },
    ]);
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    expect(row.issues.filter((i) => i.field === "uom" && i.severity === "error")).toHaveLength(0);
  });

  it("flags unknown dish", async () => {
    const db = makeDb();
    const config = createDishIngredientsImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        dish_number: "No Such Dish",
        ingredient: "Flour",
        uom: "KG",
        quantity: 1,
      },
    ]);
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    const dishIssue = row.issues.find((i) => i.field === "dish_number" && i.severity === "error");
    expect(dishIssue?.code).toBe("cross_field");
    expect(dishIssue?.message).toMatch(/not found/i);
  });

  it("normalizes litre synonym then flags vs KG stock", async () => {
    const db = makeDb();
    const config = createDishIngredientsImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        dish_number: "Club Sandwich",
        ingredient: "Flour",
        uom: "litre",
        quantity: 1,
      },
    ]);
    expect(normalized[0].values.uom).toBe("L");
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    expect(row.issues.some((i) => i.field === "uom" && i.code === "cross_field")).toBe(true);
  });
});
