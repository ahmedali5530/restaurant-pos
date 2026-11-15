import {describe, expect, it} from "vitest";
import {csvCellFromValue, recordsToImportCsv} from "@/lib/data-import/records-to-csv.ts";
import type {ImportConfiguration, ImportRecord} from "@/lib/data-import/types.ts";

const config: ImportConfiguration = {
  id: "test_dishes",
  entityLabel: "Dishes",
  fields: [
    {name: "name", label: "Name", type: "string"},
    {name: "number", label: "Number", type: "string"},
    {name: "categories", label: "Categories", type: "reference[]"},
    {name: "price", label: "Price", type: "number"},
  ],
  extractionInstructions: "",
  onImportRow: async () => {},
};

describe("csvCellFromValue", () => {
  it("serializes references as labels", () => {
    expect(
      csvCellFromValue(
        {name: "cat", label: "Category", type: "reference"},
        {label: "Mains", id: "category:1"},
      ),
    ).toBe("Mains");
  });

  it("joins reference arrays", () => {
    expect(
      csvCellFromValue(
        {name: "categories", label: "Categories", type: "reference[]"},
        [{label: "Mains"}, {label: "Lunch"}],
      ),
    ).toBe("Mains, Lunch");
  });
});

describe("recordsToImportCsv", () => {
  it("emits label headers and skips skipped rows", () => {
    const records: ImportRecord[] = [
      {
        clientId: "1",
        values: {
          name: "Burger",
          number: "12",
          categories: [{label: "Mains"}],
          price: 9.5,
        },
        issues: [],
      },
      {
        clientId: "2",
        values: {name: "Skip me", number: "", categories: [], price: 0},
        issues: [],
        skipped: true,
      },
    ];
    const csv = recordsToImportCsv(config, records);
    expect(csv).toContain("Name,Number,Categories,Price");
    expect(csv).toContain("Burger");
    expect(csv).toContain("Mains");
    expect(csv).not.toContain("Skip me");
  });
});
