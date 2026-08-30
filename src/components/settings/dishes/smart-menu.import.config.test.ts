import {describe, expect, it, vi} from "vitest";
import {
  dedupePriceGroupNames,
  expandSmartMenuGraph,
  sizeMatrixFingerprint,
  createSmartMenuImportConfig,
} from "@/components/settings/dishes/smart-menu.import.config.ts";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {validateRecords} from "@/lib/data-import/validate.ts";
import type {ImportDbLike, ImportRecord} from "@/lib/data-import/types.ts";

const t = (key: string) => key;

describe("expandSmartMenuGraph", () => {
  it("expands three price tiers with synthesized dish links", () => {
    const rows = expandSmartMenuGraph({
      dishes: [
        {name: "Chicken Tikka", price_group: "classic"},
        {name: "Crust Pizza", price_group: "crust"},
        {name: "Feastro Special", price_group: "special"},
      ],
      price_groups: [
        {
          id: "classic",
          group_name: "Size – Classic",
          sizes: [
            {code: "S", price: 699},
            {code: "M", price: 1280},
            {code: "L", price: 1999},
          ],
        },
        {
          id: "crust",
          group_name: "Size – Crust",
          sizes: [
            {code: "M", price: 1380},
            {code: "L", price: 2070},
          ],
        },
        {
          id: "special",
          group_name: "Size – Special",
          sizes: [
            {code: "M", price: 1350},
            {code: "L", price: 1949},
          ],
        },
      ],
      addons: [
        {
          group_name: "Extra Topping",
          modifier_name: "Extra Topping",
          prices_by_size: {M: 260, L: 360},
        },
      ],
    });

    expect(rows.filter((r) => r.record_type === "dish")).toHaveLength(3);
    expect(rows.filter((r) => r.record_type === "size_option")).toHaveLength(7);
    expect(rows.filter((r) => r.record_type === "addon_option")).toHaveLength(1);
    expect(rows.filter((r) => r.record_type === "dish_link")).toHaveLength(3);
    expect(rows.filter((r) => r.record_type === "nested_override").length).toBeGreaterThan(0);

    const classicLink = rows.find(
      (r) => r.record_type === "dish_link" && r.dish_name === "Chicken Tikka"
    );
    expect(classicLink?.group_name).toBe("Size – Classic");
  });
});

describe("dedupePriceGroupNames", () => {
  it("suffixes groups that share a name but differ in prices", () => {
    const out = dedupePriceGroupNames([
      {
        group_name: "Size",
        sizes: [{code: "M", name: "Medium", price: 100}],
      },
      {
        group_name: "Size",
        sizes: [{code: "M", name: "Medium", price: 200}],
      },
    ]);

    expect(out[0].group_name).toBe("Size");
    expect(out[1].group_name).toBe("Size (2)");
    expect(sizeMatrixFingerprint(out[0].sizes)).not.toBe(sizeMatrixFingerprint(out[1].sizes));
  });
});

describe("resolveSmartMenuReferences", () => {
  it("creates a new modifier dish when label matches a sellable dish but not a modifier option", async () => {
    const db: ImportDbLike = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM category")) return [[]];
        if (sql.includes("modifier FROM")) {
          return [[{id: "menu_item:small", name: "Small"}]];
        }
        if (sql.includes("FROM menu_item")) return [[]];
        return [[]];
      }),
    };

    const config = createSmartMenuImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        record_type: "size_option",
        group_name: "Size – Classic",
        modifier: "Large",
        name: "Large",
        price: 1999,
      },
    ]);

    const records = await validateRecords(config, normalized, {resolveRefs: true});
    const modifier = records[0].values.modifier as {label: string; create?: boolean; id?: string};
    expect(modifier.label).toBe("Large");
    expect(modifier.create).toBe(true);
    expect(modifier.id).toBeUndefined();
  });

  it("reuses an existing dish when it is already a modifier option", async () => {
    const db: ImportDbLike = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("modifier FROM")) {
          return [[{id: "menu_item:medium", name: "Medium"}]];
        }
        if (sql.includes("FROM menu_item")) return [[]];
        return [[]];
      }),
    };

    const config = createSmartMenuImportConfig({db, t});
    const normalized = normalizeRecords(config, [
      {
        record_type: "size_option",
        group_name: "Size – Classic",
        modifier: "Medium",
        name: "Medium",
        price: 1280,
      },
    ]);

    const records = await validateRecords(config, normalized, {resolveRefs: true});
    const modifier = records[0].values.modifier as {label: string; create?: boolean; id?: string};
    expect(modifier.id).toBe("menu_item:medium");
    expect(modifier.create).not.toBe(true);
  });
});

describe("importSmartMenuBatch name isolation", () => {
  it("creates a new pizza even when catalog has the same name", async () => {
    const createdDishes: any[] = [];
    const relates: any[] = [];

    const db: ImportDbLike = {
      query: vi.fn(async (sql: string, vars?: Record<string, any>) => {
        if (sql.includes("math::max")) return [[{max_value: 100}]];
        if (sql.includes("modifier FROM")) return [[]];
        if (sql.includes("FROM modifier_group")) return [[]];
        if (sql.includes("dish_modifier_groups")) return [[]];
        if (sql.includes("UPDATE $group SET modifiers +=")) return [[]];
        if (sql.includes("RELATE")) {
          relates.push(vars);
          return [[]];
        }
        return [[]];
      }),
      create: vi.fn(async (table: string, data: any) => {
        if (table === "menu_item") {
          const row = {id: `menu_item:${data.name.replace(/\s+/g, "_")}`, ...data};
          createdDishes.push(row);
          return [row];
        }
        if (table === "modifier") {
          return [{id: `modifier:${createdDishes.length}`, ...data}];
        }
        if (table === "modifier_group") {
          return [{id: `modifier_group:${data.name}`, ...data, modifiers: []}];
        }
        return [{id: "x:1"}];
      }),
      merge: vi.fn(async () => [{}]),
    };

    const config = createSmartMenuImportConfig({db, t});
    const records: ImportRecord[] = normalizeRecords(config, [
      {record_type: "dish", name: "Chicken Tikka", dish_name: "Chicken Tikka", price: 0},
      {
        record_type: "size_option",
        group_name: "Size – Classic",
        modifier: {label: "Medium", create: true},
        name: "Medium",
        price: 1280,
      },
      {
        record_type: "dish_link",
        dish_name: "Chicken Tikka",
        group_name: "Size – Classic",
        has_required_modifiers: true,
        required_modifiers: 1,
        should_auto_open: true,
      },
    ]);

    const summary = await config.onImportBatch!(records, {
      mode: "create",
      matchFields: [],
      index: 0,
    });

    expect(summary?.failed ?? []).toHaveLength(0);
    expect(createdDishes.some((d) => d.name === "Chicken Tikka")).toBe(true);
    expect(relates.length).toBeGreaterThan(0);
    const pizza = createdDishes.find((d) => d.name === "Chicken Tikka");
    expect(relates[0]?.dish).toBeDefined();
    expect(String(relates[0]?.dish)).toContain(String(pizza?.id).split(":").pop() ?? "Chicken_Tikka");
  });
});
