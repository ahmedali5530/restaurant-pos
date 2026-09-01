import {describe, expect, it} from "vitest";
import {listTables} from "@/api/reports/manage/lists.ts";

describe("listTables", () => {
  it("filters by floor_name in memory", async () => {
    const db = {
      query: async () => [[
        {id: "floor_table:1", name: "T1", number: "1", floor: {name: "Delivery"}},
        {id: "floor_table:2", name: "T2", number: "2", floor: {name: "Dine In"}},
      ]],
    };

    const rows = await listTables(db as any, {floor_name: "delivery"});
    expect(rows).toHaveLength(1);
    expect(rows[0].floor_name).toBe("Delivery");
  });
});
