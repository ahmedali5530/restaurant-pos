import {describe, expect, it} from "vitest";
import {formatImportDisplayValue} from "@/lib/data-import/format-display-value.ts";
import type {ImportField} from "@/lib/data-import/types.ts";

const t = (key: string, options?: any) => options?.defaultValue ?? key;

const stringField: ImportField = {name: "name", label: "Name", type: "string"};
const boolField: ImportField = {name: "active", label: "Active", type: "boolean"};
const refField: ImportField = {name: "tax", label: "Tax", type: "reference"};
const refArrayField: ImportField = {name: "categories", label: "Categories", type: "reference[]"};

describe("formatImportDisplayValue", () => {
  it("returns em dash for empty values", () => {
    expect(formatImportDisplayValue(stringField, null, t)).toBe("—");
    expect(formatImportDisplayValue(stringField, "", t)).toBe("—");
  });

  it("formats booleans with yes/no labels", () => {
    expect(formatImportDisplayValue(boolField, true, t)).toBe("Yes");
    expect(formatImportDisplayValue(boolField, false, t)).toBe("No");
  });

  it("formats reference with (new) suffix when create flag set", () => {
    expect(formatImportDisplayValue(refField, {label: "VAT", create: true}, t)).toBe("VAT (new)");
    expect(formatImportDisplayValue(refField, {label: "VAT", id: "tax:1"}, t)).toBe("VAT");
  });

  it("formats reference arrays joined by comma", () => {
    expect(formatImportDisplayValue(refArrayField, [
      {label: "Pizza", id: "cat:1"},
      {label: "Sushi", create: true},
    ], t)).toBe("Pizza, Sushi (new)");
  });

  it("formats numbers and strings", () => {
    expect(formatImportDisplayValue(stringField, "Hello", t)).toBe("Hello");
    expect(formatImportDisplayValue({...stringField, type: "number"}, 9.5, t)).toBe("9.5");
  });

  it("formats plain string arrays", () => {
    const field: ImportField = {name: "buy_category_names", label: "Buy categories", type: "string"};
    expect(formatImportDisplayValue(field, ["Starter", "Appetizer"], t)).toBe("Starter, Appetizer");
  });

  it("masks set_password values", () => {
    const field: ImportField = {name: "set_password", label: "Password", type: "string"};
    expect(formatImportDisplayValue(field, "secret", t)).toBe("Password will be set on confirm");
  });
});
