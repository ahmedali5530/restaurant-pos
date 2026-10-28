import {describe, expect, it} from "vitest";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {validateRecords} from "@/lib/data-import/validate.ts";
import {createDishIngredientsImportConfig} from "@/components/settings/dishes/dish-ingredients.import.config.ts";

const t = (key: string, opts?: {defaultValue?: string}) =>
  opts?.defaultValue ?? key;

describe("dish ingredients cleanse validation", () => {
  const makeDb = (opts?: {existingRecipes?: any[]; dishes?: any[]}) => {
    const dishes = opts?.dishes ?? [
      {id: "menu_item:1", name: "Club Sandwich", number: "101", price: 100},
      {id: "menu_item:2", name: "Soup", number: "102", price: 50},
      {id: "menu_item:3", name: "Build Your Own", number: "103", price: 0},
    ];
    const items = [
      {
        id: "inventory_item:flour",
        name: "Flour",
        code: "FLR",
        uom: "KG",
        price: 80,
        item_types: ["raw"],
      },
      {
        id: "inventory_item:milk",
        name: "Milk",
        code: "MLK",
        uom: "L",
        price: 10,
        item_types: ["raw"],
      },
    ];

    return {
      query: async (sql: string, vars?: Record<string, any>) => {
        if (sql.includes("FROM menu_item_recipe") || sql.includes("menu_item_recipe")) {
          return [opts?.existingRecipes ?? []];
        }
        if (sql.includes("FROM menu_item") && sql.includes("price")) {
          return [dishes];
        }
        if (sql.includes("FROM inventory_item") && sql.includes("id IN")) {
          const ids = (vars?.ids ?? []).map((id: any) => String(id));
          return [items.filter((item) => ids.includes(String(item.id)))];
        }
        if (sql.includes("FROM inventory_item")) {
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

  it("warns when recipe food cost exceeds dish selling price", async () => {
    const db = makeDb();
    const config = createDishIngredientsImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        dish_number: "101",
        ingredient: "Flour",
        uom: "KG",
        quantity: 2,
        cost: 80,
      },
    ]);
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    const warn = row.issues.find(
      (i) => i.code === "cross_field" && i.severity === "warning" && /exceeds/i.test(i.message),
    );
    expect(warn).toBeTruthy();
    expect(warn?.message).toMatch(/160|100/);
  });

  it("skips cost-vs-price warning when dish base price is 0 (modifier-priced)", async () => {
    const db = makeDb();
    const config = createDishIngredientsImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        dish_number: "103",
        ingredient: "Flour",
        uom: "KG",
        quantity: 2,
        cost: 80,
      },
    ]);
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    expect(
      row.issues.some(
        (i) => i.severity === "warning" && /exceeds/i.test(i.message),
      ),
    ).toBe(false);
  });

  it("includes existing recipe lines not in the file when checking price", async () => {
    const db = makeDb({
      existingRecipes: [
        {
          menu_item: "menu_item:1",
          item: "inventory_item:milk",
          quantity: 3,
          cost: 10,
        },
      ],
    });
    const config = createDishIngredientsImportConfig({db, t});
    // File line alone: 1 * 80 = 80 (< 100). With existing milk 30 → 110 > 100.
    const normalized = normalizeRecords(config, [
      {
        dish_number: "101",
        ingredient: "Flour",
        uom: "KG",
        quantity: 1,
        cost: 80,
      },
    ]);
    normalized[0].values.ingredient = {
      label: "Flour",
      id: "inventory_item:flour",
    };
    const [row] = await validateRecords(config, normalized, {resolveRefs: false});
    expect(
      row.issues.some(
        (i) => i.severity === "warning" && /exceeds/i.test(i.message),
      ),
    ).toBe(true);
  });
});
