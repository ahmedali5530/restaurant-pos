import {describe, expect, it, vi} from "vitest";
import {
  parseDiscountCategory,
  parseOptionalNumber,
  parseSchedules,
  parseStackingMode,
  parseTaxTreatment,
  resolveBxgyConditions,
} from "@/components/settings/discounts/discount-import-helpers.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

describe("discount-import-helpers", () => {
  it("parses buy_x_get_y category aliases", () => {
    expect(parseDiscountCategory("buy_x_get_y")).toBe("buy_x_get_y");
    expect(parseDiscountCategory("bxgy")).toBe("buy_x_get_y");
  });

  it("parses schedules JSON", () => {
    const schedules = parseSchedules('[{"days_of_week":[1,2],"start_time":"09:00","end_time":"17:00"}]');
    expect(schedules).toHaveLength(1);
    expect(schedules[0].days_of_week).toEqual([1, 2]);
    expect(schedules[0].start_time).toBe("09:00");
  });

  it("defaults stacking and tax treatment", () => {
    expect(parseStackingMode(undefined)).toBe("allow");
    expect(parseTaxTreatment(undefined)).toBe("tax_before_discount");
  });

  it("parses optional numbers and treats placeholders as empty", () => {
    expect(parseOptionalNumber(undefined)).toBeNull();
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("none")).toBeNull();
    expect(parseOptionalNumber("—")).toBeNull();
    expect(parseOptionalNumber("12.5")).toBe(12.5);
    expect(parseOptionalNumber(8)).toBe(8);
  });

  it("preserves category:table:id when resolving bxgy targets by name", async () => {
    const db = {
      query: vi.fn(async () => [[{id: {tb: "category", id: "starter123"}}]]),
    } as unknown as ImportDbLike;

    const conditions = await resolveBxgyConditions(db, {
      category: "buy_x_get_y",
      buy_category_names: ["Starter"],
      get_category_names: ["Starter"],
    });

    expect(conditions?.buy_targets?.category_ids).toEqual(["category:starter123"]);
    expect(conditions?.get_targets?.category_ids).toEqual(["category:starter123"]);
  });

  it("accepts qualified and bare category ids from assistant tool output", async () => {
    const db = {query: vi.fn()} as unknown as ImportDbLike;

    const qualified = await resolveBxgyConditions(db, {
      category: "buy_x_get_y",
      buy_category_names: ["category:buy123"],
      get_category_names: ["category:get456"],
    });
    expect(qualified?.buy_targets?.category_ids).toEqual(["category:buy123"]);
    expect(qualified?.get_targets?.category_ids).toEqual(["category:get456"]);
    expect(db.query).not.toHaveBeenCalled();

    const bare = await resolveBxgyConditions(db, {
      category: "buy_x_get_y",
      buy_category_names: ["bareid1234"],
      get_category_names: ["bareid5678"],
    });
    expect(bare?.buy_targets?.category_ids).toEqual(["category:bareid1234"]);
    expect(bare?.get_targets?.category_ids).toEqual(["category:bareid5678"]);
  });
});
