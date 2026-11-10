import {describe, expect, it, vi} from "vitest";
import {
  assertUniqueMatch,
  findRecordsByIdOrKeys,
  resolveUpdateMatchesByIdOrLegacy,
} from "@/lib/data-import/match-by-id.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

const t = (key: string, options?: any) => options?.defaultValue ?? key;

describe("findRecordsByIdOrKeys", () => {
  it("prefers id lookup over business keys", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("id = $id");
      expect(sql).not.toContain("code =");
      return [[{id: "inventory_item:1", code: "OLD"}]];
    });
    const db: ImportDbLike = {query};

    const rows = await findRecordsByIdOrKeys(db, "inventory_item", {
      id: "inventory_item:1",
      keys: {code: "IGNORED"},
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("OLD");
  });

  it("falls back to business keys when id is absent", async () => {
    const query = vi.fn(async (sql: string, params: any) => {
      expect(sql).toContain("code = $m_code");
      expect(params.m_code).toBe("SKU1");
      return [[{id: "inventory_item:2", code: "SKU1"}]];
    });
    const db: ImportDbLike = {query};

    const rows = await findRecordsByIdOrKeys(db, "inventory_item", {
      keys: {code: "SKU1"},
    });
    expect(rows).toHaveLength(1);
  });

  it("returns multiple rows when rejectAmbiguousKeys and keys collide", async () => {
    const db: ImportDbLike = {
      query: vi.fn(async () => [
        [
          {id: "menu_item:1", number: "10"},
          {id: "menu_item:2", number: "10"},
        ],
      ]),
    };

    const rows = await findRecordsByIdOrKeys(db, "menu_item", {
      keys: {number: "10"},
      rejectAmbiguousKeys: true,
      limit: 2,
    });
    expect(rows).toHaveLength(2);
  });
});

describe("assertUniqueMatch", () => {
  it("throws not-found / ambiguous with clear messages", () => {
    expect(() => assertUniqueMatch([], t)).toThrow(/recordNotFound|No matching/);
    expect(() =>
      assertUniqueMatch([{id: "a"}, {id: "b"}], t, {keyLabel: "code", keyValue: "X"}),
    ).toThrow(/Multiple records match/);
  });
});

describe("resolveUpdateMatchesByIdOrLegacy", () => {
  it("returns [] for create mode", async () => {
    const legacy = vi.fn(async () => [{id: "x"}]);
    const rows = await resolveUpdateMatchesByIdOrLegacy({} as ImportDbLike, "t", {
      mode: "create",
      id: "t:1",
      legacy,
    });
    expect(rows).toEqual([]);
    expect(legacy).not.toHaveBeenCalled();
  });

  it("uses legacy matcher when id is empty", async () => {
    const legacy = vi.fn(async () => [{id: "legacy:1"}]);
    const rows = await resolveUpdateMatchesByIdOrLegacy({} as ImportDbLike, "t", {
      mode: "update",
      id: "",
      legacy,
    });
    expect(rows).toEqual([{id: "legacy:1"}]);
    expect(legacy).toHaveBeenCalled();
  });
});
