import {describe, expect, it} from "vitest";
import {formatFloorTableLabel} from "@/api/reports/shared/records.ts";

describe("formatFloorTableLabel", () => {
  it("combines name and number like the POS UI", () => {
    expect(formatFloorTableLabel({name: "T", number: "5"})).toBe("T5");
    expect(formatFloorTableLabel({name: "Patio", number: 12})).toBe("Patio12");
  });

  it("falls back to whichever part is present", () => {
    expect(formatFloorTableLabel({name: "Bar"})).toBe("Bar");
    expect(formatFloorTableLabel({number: "3"})).toBe("3");
    expect(formatFloorTableLabel(null)).toBe("");
  });
});
