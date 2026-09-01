import {describe, expect, it} from "vitest";
import {
  isMeaningfulPreviewValue,
  selectPreviewFields,
  shouldUseCardPreviewLayout,
} from "@/components/ai-assistant/write-proposal-preview.helpers.ts";
import type {ImportField, ImportRecord} from "@/lib/data-import/types.ts";

const field = (name: string, type: ImportField["type"] = "string"): ImportField => ({
  name,
  label: name,
  type,
});

describe("write-proposal-preview helpers", () => {
  it("uses card layout for wide configs", () => {
    expect(shouldUseCardPreviewLayout(7)).toBe(true);
    expect(shouldUseCardPreviewLayout(6)).toBe(false);
  });

  it("filters empty and false boolean fields", () => {
    const record: ImportRecord = {
      clientId: "1",
      values: {name: "BOGO", exclusive: false, category: "buy_x_get_y"},
      issues: [],
    };
    const columns = [
      field("name"),
      field("exclusive", "boolean"),
      field("category"),
      field("max_cap"),
    ];

    const selected = selectPreviewFields(columns, record, ["name"]);
    expect(selected.map(col => col.name)).toEqual(["name", "category"]);
  });

  it("treats arrays as meaningful", () => {
    expect(isMeaningfulPreviewValue(["Starter"], field("buy_category_names"))).toBe(true);
  });
});
