import {describe, expect, it} from "vitest";
import {normalizeTableNameAndNumber} from "@/components/settings/tables/table-name-number.ts";

describe("normalizeTableNameAndNumber", () => {
  it("splits identical prefixed labels", () => {
    expect(normalizeTableNameAndNumber("F1", "F1")).toEqual({name: "F", number: "1"});
    expect(normalizeTableNameAndNumber("F10", "F10")).toEqual({name: "F", number: "10"});
  });

  it("strips number suffix duplicated on name", () => {
    expect(normalizeTableNameAndNumber("F1", "1")).toEqual({name: "F", number: "1"});
  });

  it("strips prefix duplicated on number", () => {
    expect(normalizeTableNameAndNumber("F", "F1")).toEqual({name: "F", number: "1"});
  });

  it("leaves already-correct pairs alone", () => {
    expect(normalizeTableNameAndNumber("F", "1")).toEqual({name: "F", number: "1"});
    expect(normalizeTableNameAndNumber("A", "10")).toEqual({name: "A", number: "10"});
  });

  it("does not invent a split for pure numeric duplicates", () => {
    expect(normalizeTableNameAndNumber("10", "10")).toEqual({name: "10", number: "10"});
  });
});
