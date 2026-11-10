import {describe, expect, it} from "vitest";
import {
  buildAnalyzeContentParts,
  formatAnalyzeUserMessage,
} from "@/lib/ai/assistant-file-preview.ts";

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

  it("describes vision attachments for pdf/image", () => {
    const message = formatAnalyzeUserMessage("What is the total?", {
      fileName: "menu.pdf",
      kind: "pdf",
      text: "PDF attached (2 page(s) prepared for visual analysis).",
      truncated: false,
      rowCount: 0,
      sheetCount: 0,
      imageUrls: ["data:image/jpeg;base64,aaa", "data:image/jpeg;base64,bbb"],
      pageCount: 2,
    });
    expect(message).toContain("menu.pdf");
    expect(message).toContain("Vision pages prepared: 2");
    expect(message).toContain("What is the total?");
    expect(message).not.toContain("```csv");
  });
});

describe("buildAnalyzeContentParts", () => {
  it("returns plain text when there are no images", () => {
    expect(buildAnalyzeContentParts("hello", [])).toBe("hello");
  });

  it("returns multimodal parts when images are present", () => {
    const parts = buildAnalyzeContentParts("look", ["data:image/jpeg;base64,x"]);
    expect(Array.isArray(parts)).toBe(true);
    expect(parts).toEqual([
      {type: "text", text: "look"},
      {type: "image_url", image_url: {url: "data:image/jpeg;base64,x", detail: "high"}},
    ]);
  });
});
