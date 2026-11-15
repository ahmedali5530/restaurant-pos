import {describe, expect, it} from "vitest";
import {
  CHANGEFEED_TOOL_NAME,
  isChangefeedPrompt,
  resolveChangefeedTableFromPrompt,
} from "@/lib/ai/changefeed-query.ts";
import {applyPromptToolFilters, detectDomainsForPrompt, selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";
import {
  normalizeChangefeedTable,
  sinceLiteral,
  getTableChangefeed,
  formatChangefeedAsAnswer,
  slimChangefeedValue,
} from "@/api/reports/operations/changefeed.ts";
import {Tables} from "@/api/db/tables.ts";
import {tryChangefeedFastPath} from "@/lib/ai/changefeed-fast-path.ts";

describe("changefeed prompt gating", () => {
  it.each([
    "show changefeed for order table",
    "SHOW CHANGES for order_void since yesterday",
    "what is the mutation history for order",
    "pull the change feed for payments",
    "what changed in the table order",
    "pull changefeed for menu_item",
    "get_table_changefeed for menu_item",
    "show me the menu_item changefeed",
  ])("detects changefeed prompt: %s", (prompt) => {
    expect(isChangefeedPrompt(prompt)).toBe(true);
  });

  it.each([
    "sales today",
    "list orders in progress",
    "order detail for order:abc",
    "activity log for this week",
    "void summary yesterday",
  ])("stays dormant for normal report: %s", (prompt) => {
    expect(isChangefeedPrompt(prompt)).toBe(false);
  });

  it("injects tool only for changefeed prompts", () => {
    const withCf = applyPromptToolFilters(["get_orders"], "show changefeed for order");
    expect(withCf[0]).toBe(CHANGEFEED_TOOL_NAME);
    expect(withCf).toContain("get_orders");

    const without = applyPromptToolFilters(
      ["get_orders", CHANGEFEED_TOOL_NAME],
      "sales today",
    );
    expect(without).toEqual(["get_orders"]);
  });

  it("selectToolsForPrompt keeps changefeed off by default (compact)", () => {
    const sales = selectToolsForPrompt("sales summary today", "table", ["reports.changefeed"], true);
    expect(sales.tools.map(t => t.function.name)).not.toContain(CHANGEFEED_TOOL_NAME);

    const cf = selectToolsForPrompt(
      "show changefeed for order table",
      "table",
      ["reports.changefeed"],
      true,
    );
    expect(cf.tools.map(t => t.function.name)).toEqual([CHANGEFEED_TOOL_NAME]);
    expect(detectDomainsForPrompt("show changefeed for order table")).toContain("operations");
  });

  it("RBAC: denies changefeed tool without reports.changefeed", () => {
    const denied = selectToolsForPrompt(
      "pull changefeed for menu_item",
      "table",
      ["reports.sales_summary", "admin.dishes"],
      true,
    );
    expect(denied.tools.map(t => t.function.name)).toEqual([]);
  });

  it("RBAC: allows changefeed with reports.changefeed, parent reports, or reports.ai", () => {
    for (const mods of [["reports.changefeed"], ["reports"], ["reports.ai"]] as string[][]) {
      const cf = selectToolsForPrompt("pull changefeed for menu_item", "table", mods, true);
      expect(cf.tools.map(t => t.function.name)).toEqual([CHANGEFEED_TOOL_NAME]);
    }
  });

  it("resolves menu_item from common phrasings", () => {
    expect(resolveChangefeedTableFromPrompt("pull changefeed for menu_item")).toBe("menu_item");
    expect(resolveChangefeedTableFromPrompt("show me the menu_item changefeed")).toBe("menu_item");
    expect(resolveChangefeedTableFromPrompt("get_table_changefeed for menu_item")).toBe("menu_item");
  });
});

describe("changefeed fetcher helpers", () => {
  it("normalizes aliases to allowlisted table names", () => {
    expect(normalizeChangefeedTable("orders")).toBe(Tables.orders);
    expect(normalizeChangefeedTable("order_void")).toBe(Tables.order_voids);
    expect(normalizeChangefeedTable("menu_item")).toBe(Tables.dishes);
    expect(normalizeChangefeedTable("dishes")).toBe(Tables.dishes);
    expect(normalizeChangefeedTable("inventory_item")).toBeNull();
  });

  it("builds safe SINCE literals", () => {
    expect(sinceLiteral()).toBe("0");
    expect(sinceLiteral(undefined)).toBe("0");
    expect(sinceLiteral(42)).toBe("42");
    expect(sinceLiteral("yesterday")).toBe("0");
    expect(sinceLiteral("2026-11-01")).toBe('d"2026-11-01T00:00:00.000Z"');
    expect(sinceLiteral('d"2026-11-01T12:00:00.000Z"')).toBe('d"2026-11-01T12:00:00.000Z"');
  });

  it("rejects non-allowlisted tables without querying", async () => {
    const db = {query: async () => { throw new Error("should not query"); }};
    const result = await getTableChangefeed(db as any, {table: "inventory_item"});
    expect(result.ok).toBe(false);
    expect(result.mutations).toEqual([]);
  });

  it("accepts menu_item alias for dishes", async () => {
    const db = {
      query: async (q: string) => {
        expect(q).toContain("SHOW CHANGES FOR TABLE menu_item");
        expect(q).toMatch(/LIMIT 1000\b/);
        return [[]];
      },
    };
    const result = await getTableChangefeed(db as any, {table: "menu_item", since: 0});
    expect(result.ok).toBe(true);
    expect(result.table).toBe(Tables.dishes);
  });

  it("returns latest data mutations instead of only early SCHEMA define_table", async () => {
    const db = {
      query: async () => [[
        {versionstamp: 1, changes: [{define_table: {name: "menu_item"}}]},
        {versionstamp: 2, changes: [{define_table: {name: "menu_item"}}]},
        {versionstamp: 3, changes: [{update: {id: "menu_item:1", name: "Soup", price: 399}}]},
        {versionstamp: 4, changes: [{update: {id: "menu_item:2", name: "BBQ", price: 799}}]},
      ]],
    };
    const result = await getTableChangefeed(db as any, {table: "menu_item", since: 0, limit: 50});
    expect(result.ok).toBe(true);
    expect(result.data_mutation_count).toBe(2);
    expect(result.mutations.some((m: any) => m.action === "UPDATE")).toBe(true);
    expect(result.mutations.some((m: any) => m.value?.name === "BBQ")).toBe(true);
  });

  it("parses SHOW CHANGES batches and filters by record_id", async () => {
    const db = {
      query: async () => [[
        {
          versionstamp: 10,
          changes: [
            {create: {id: "order:1", total: 1}},
            {update: {id: "order:2", total: 2}},
          ],
        },
        {
          versionstamp: 20,
          changes: [{delete: {id: "order:2"}}],
        },
      ]],
    };
    const result = await getTableChangefeed(db as any, {
      table: "order",
      since: 0,
      record_id: "order:2",
      compact: true,
    });
    expect(result.ok).toBe(true);
    expect(result.mutation_count).toBe(1);
    expect(result.mutations[0]).toMatchObject({
      action: "DELETE",
      record_id: "order:2",
    });
  });

  it("resolves table aliases from prompts", () => {
    expect(resolveChangefeedTableFromPrompt("pull changefeed for menu_item")).toBe("menu_item");
    expect(resolveChangefeedTableFromPrompt("show changefeed for order")).toBe("order");
  });

  it("slims bulky dish after-images", () => {
    const slim = slimChangefeedValue({
      id: "menu_item:1",
      name: "BBQ Chicken Sandwich",
      price: 800,
      image: "huge-base64...",
      categories: [{name: "Sandwiches"}],
      meta: {x: 1},
    });
    expect(slim.name).toBe("BBQ Chicken Sandwich");
    expect(slim.price).toBe(800);
    expect(slim.image).toBeUndefined();
    expect(slim.categories).toEqual(["Sandwiches"]);
    expect(slim._fields_omitted).toBeGreaterThan(0);
  });

  it("formats a human-readable before→after answer", () => {
    const md = formatChangefeedAsAnswer({
      ok: true,
      table: "menu_item",
      event_count: 2,
      data_mutation_count: 1,
      schema_event_count: 1,
      mutations: [
        {action: "SCHEMA", record_id: "", versionstamp: 1, value: {name: "menu_item"}},
        {
          action: "UPDATE",
          record_id: "menu_item:1",
          versionstamp: 2,
          at: "04 Nov 2026, 11:22 AM",
          label: "BBQ Chicken Sandwich (#70)",
          changes: [{field: "price", from: 800, to: 799}],
          value: {name: "BBQ Chicken Sandwich", price: 799},
        },
      ],
    });
    expect(md).toContain("| Time | Action | Record | Changes |");
    expect(md).toContain("BBQ Chicken Sandwich");
    expect(md).toContain("price: 800 → 799");
    expect(md).toContain("04 Nov 2026, 11:22 AM");
    expect(md).toContain("| UPDATE |");
  });

  it("serializes Surreal DateTime fields instead of [object Object]", async () => {
    const {DateTime} = await import("surrealdb");
    const db = {
      query: async () => [[
        {
          versionstamp: 1,
          changes: [{
            update: {
              id: "menu_item:1",
              name: "BBQ",
              price: 800,
              created_at: new DateTime("2026-11-04T06:22:12.000Z"),
            },
          }],
        },
        {
          versionstamp: 2,
          changes: [{
            update: {
              id: "menu_item:1",
              name: "BBQ",
              price: 799,
              created_at: new DateTime("2026-11-04T06:30:00.000Z"),
            },
          }],
        },
      ]],
    };
    const result = await getTableChangefeed(db as any, {table: "menu_item", since: 0});
    expect(result.mutations[1]?.at).toBeTruthy();
    expect(result.mutations[1]?.at).not.toContain("[object Object]");
    expect(String(result.mutations[1]?.value?.created_at)).not.toContain("[object Object]");
    const md = formatChangefeedAsAnswer(result as any);
    expect(md).toContain("| Time | Action | Record | Changes |");
    expect(md).not.toContain("[object Object]");
    expect(md).toContain("price: 800 → 799");
  });

  it("fast path returns a direct answer for menu_item", async () => {
    const db = {
      query: async () => [[
        {versionstamp: 1, changes: [{update: {id: "menu_item:1", name: "BBQ", price: 800, created_at: "2026-11-04T06:00:00.000Z"}}]},
        {versionstamp: 2, changes: [{update: {id: "menu_item:1", name: "BBQ", price: 799, created_at: "2026-11-04T06:22:00.000Z"}}]},
      ]],
    };
    const result = await tryChangefeedFastPath(db as any, "pull changefeed for menu_item", {
      allowedModules: ["reports.changefeed"],
    });
    expect(result?.directAnswer).toContain("BBQ");
    expect(result?.directAnswer).toContain("800 → 799");
    expect(result?.directAnswer).toContain("UPDATE");
  });

  it("diffs only changed fields across consecutive after-images", async () => {
    const db = {
      query: async () => [[
        {versionstamp: 1, changes: [{update: {id: "menu_item:1", name: "Soup", price: 399, number: "19"}}]},
        {versionstamp: 2, changes: [{update: {id: "menu_item:1", name: "Soup", price: 449, number: "19"}}]},
      ]],
    };
    const result = await getTableChangefeed(db as any, {table: "menu_item", since: 0});
    const updates = result.mutations.filter((m: any) => m.action === "UPDATE");
    expect(updates).toHaveLength(2);
    expect(updates[1]?.changes).toEqual([{field: "price", from: 399, to: 449}]);
    expect(updates[1]?.label).toContain("Soup");
  });

  it("fast path denies without reports.changefeed", async () => {
    const db = {query: async () => { throw new Error("should not query"); }};
    const result = await tryChangefeedFastPath(db as any, "pull changefeed for menu_item", {
      allowedModules: ["reports.sales_summary"],
    });
    expect(result?.directAnswer).toMatch(/permission/i);
    expect(result?.result).toMatchObject({error: "permission_denied"});
  });

  it("serializes bigint versionstamps for JSON", async () => {
    const db = {
      query: async () => [[
        {
          versionstamp: 116395873313095680n,
          changes: [{update: {id: "menu_item:1", name: "BBQ", price: 800}}],
        },
      ]],
    };
    const result = await getTableChangefeed(db as any, {table: "menu_item", since: 0});
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(typeof result.mutations[0].versionstamp).toBe("string");
    expect(typeof result.last_versionstamp).toBe("string");
  });

  it("keeps schema define_table events so counts match the DB feed", async () => {
    const db = {
      query: async () => [[
        {versionstamp: 1, changes: [{define_table: {name: "menu_item", changefeed: {expiry: "14d"}}}]},
        {versionstamp: 2, changes: [{define_table: {name: "menu_item", changefeed: {expiry: "14d"}}}]},
        {versionstamp: 3, changes: [{update: {id: "menu_item:1", price: 700}}]},
        {versionstamp: 4, changes: [{update: {id: "menu_item:1", price: 800}}]},
      ]],
    };
    const result = await getTableChangefeed(db as any, {table: "menu_item", since: 0});
    expect(result.ok).toBe(true);
    expect(result.event_count).toBe(4);
    expect(result.schema_event_count).toBe(2);
    expect(result.data_mutation_count).toBe(2);
    expect(result.mutations.map((m) => m.action)).toEqual([
      "SCHEMA",
      "SCHEMA",
      "UPDATE",
      "UPDATE",
    ]);
  });
});
