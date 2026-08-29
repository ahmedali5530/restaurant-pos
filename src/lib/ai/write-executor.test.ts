import {describe, expect, it, vi} from "vitest";
import {buildWriteProposal} from "@/lib/ai/tools/write-tools.ts";
import {commitWriteProposal} from "@/lib/ai/write-executor.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

const t = (key: string, options?: any) => options?.defaultValue ?? key;

const makeDb = (): ImportDbLike & {creates: any[]; inserts: any[]} => {
  const creates: any[] = [];
  const inserts: any[] = [];
  return {
    creates,
    inserts,
    query: vi.fn(async (sql: string) => {
      if (sql.includes("categories")) return [[{id: "categories:1", name: "Pizza"}]];
      if (sql.includes("taxes")) return [[]];
      if (sql.includes("menu_item")) return [[]]; // number sequence probe (Tables.dishes = 'menu_item')
      return [[]];
    }),
    create: vi.fn(async (table: string, payload: any) => {
      creates.push({table, payload});
      return [{id: `${table}:new`, ...payload}];
    }),
    insert: vi.fn(async (table: string, payload: any) => {
      inserts.push({table, payload});
      return [{id: `${table}:new`, ...payload}];
    }),
    merge: vi.fn(async () => [{}]),
  };
};

describe("commitWriteProposal", () => {
  it("only writes what was in the proposal, once, on explicit call", async () => {
    const db = makeDb();
    const proposal = await buildWriteProposal(
      "propose_create_dishes",
      {dishes: [{name: "Margherita", price: 9, categories: ["Pizza"]}]},
      {db, t},
    );

    // Nothing written yet — building the proposal must not have persisted anything.
    expect(db.creates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);

    const summary = await commitWriteProposal(db, t, proposal);

    expect(summary.imported).toBe(1);
    expect(summary.failed).toBe(0);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].table).toBe("menu_item"); // Tables.dishes = 'menu_item'
    expect(db.inserts[0].payload.name).toBe("Margherita");
  });

  it("skips (does not write) rows with blocking errors, reports them as failed", async () => {
    const db = makeDb();
    const proposal = await buildWriteProposal(
      "propose_create_dishes",
      {dishes: [
        {name: "Good Dish", price: 9, categories: ["Pizza"]},
        {name: "Bad Dish"}, // missing price + categories -> blocking
      ]},
      {db, t},
    );

    expect(proposal.hasBlockingErrors).toBe(true);
    const summary = await commitWriteProposal(db, t, proposal);

    expect(summary.imported).toBe(1);
    expect(summary.failed).toBe(1);
    expect(db.inserts).toHaveLength(1); // the bad row never reached db.insert
    expect(db.inserts[0].payload.name).toBe("Good Dish");
  });

  it("rejects proposals for configs it has no executor for", async () => {
    const db = makeDb();
    await expect(
      commitWriteProposal(db, t, {
        proposalId: "x",
        toolName: "propose_create_widgets",
        configId: "widgets",
        entityLabel: "Widget",
        mode: "create",
        records: [],
        fieldNames: [],
        hasBlockingErrors: false,
      }),
    ).rejects.toThrow(/No write executor registered/);
  });

  it("omits unset max_cap from discount payload to avoid Surreal coerce errors", async () => {
    const db = makeDb();
    db.query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM category")) return [[{id: "categories:starter", name: "Starter"}]];
      return [[]];
    }) as typeof db.query;

    const proposal = await buildWriteProposal(
      "propose_create_discounts",
      {
        discounts: [{
          name: "BOGO Starters",
          type: "Percent",
          min_rate: 100,
          max_rate: 100,
          priority: 1,
          scope: "category",
          application_mode: "automatic",
          category: "buy_x_get_y",
          is_active: true,
          max_cap: null,
          buy_quantity: 1,
          get_quantity: 1,
          buy_category_names: ["Starter"],
          get_category_names: ["Starter"],
          get_value_type: "free",
        }],
      },
      {db, t},
    );

    expect(proposal.hasBlockingErrors).toBe(false);

    const summary = await commitWriteProposal(db, t, proposal);
    expect(summary.errors).toEqual([]);
    expect(summary.imported).toBe(1);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].payload).not.toHaveProperty("max_cap");
    expect(db.inserts[0].payload.name).toBe("BOGO Starters");
  });
});
