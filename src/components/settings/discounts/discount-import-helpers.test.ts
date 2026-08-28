import {describe, expect, it} from "vitest";
import {
  parseDiscountCategory,
  parseOptionalNumber,
  parseSchedules,
  parseStackingMode,
  parseTaxTreatment,
} from "@/components/settings/discounts/discount-import-helpers.ts";

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
});
