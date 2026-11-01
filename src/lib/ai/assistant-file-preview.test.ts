import {describe, expect, it} from "vitest";
import {formatAnalyzeUserMessage} from "@/lib/ai/assistant-file-preview.ts";

describe("formatAnalyzeUserMessage", () => {
  it("includes file preview and the user question", () => {
    const message = formatAnalyzeUserMessage("What is the average price?", {
      fileName: "items.csv",
      kind: "csv",
      text: "name,price\nA,1\nB,2",
      truncated: false,
      rowCount: 2,
      sheetCount: 1,
    });
    expect(message).toContain("items.csv");
    expect(message).toContain("```csv");
    expect(message).toContain("name,price");
    expect(message).toContain("What is the average price?");
  });

  it("notes truncation when preview was capped", () => {
    const message = formatAnalyzeUserMessage("Summarize", {
      fileName: "big.xlsx",
      kind: "excel",
      text: "a,b",
      truncated: true,
      rowCount: 80,
      sheetCount: 2,
    });
    expect(message).toContain("truncated");
  });
});
