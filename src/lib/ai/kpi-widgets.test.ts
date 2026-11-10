import {describe, expect, it} from "vitest";
import {isKpiLanguage, parseAiKpiBlock} from "@/lib/ai/kpi-widgets.ts";

describe("parseAiKpiBlock", () => {
  it("parses JSON array widgets", () => {
    const widgets = parseAiKpiBlock(`[
      {"label":"Net sales","value":"Rs 100","tone":"danger","hint":"down"},
      {"label":"Orders","value":"10","tone":"success"}
    ]`);
    expect(widgets).toEqual([
      {label: "Net sales", value: "Rs 100", tone: "danger", hint: "down"},
      {label: "Orders", value: "10", tone: "success"},
    ]);
  });

  it("parses pipe-delimited rows and defaults bad tones to neutral", () => {
    const widgets = parseAiKpiBlock(`Waste | 12 KG | warning | high
Open tickets | 3 | nope`);
    expect(widgets).toEqual([
      {label: "Waste", value: "12 KG", tone: "warning", hint: "high"},
      {label: "Open tickets", value: "3", tone: "neutral"},
    ]);
  });

  it("returns empty for garbage", () => {
    expect(parseAiKpiBlock("")).toEqual([]);
    expect(parseAiKpiBlock("not a widget")).toEqual([]);
  });
});

describe("isKpiLanguage", () => {
  it("detects kpi and widgets language tags", () => {
    expect(isKpiLanguage("language-kpi")).toBe(true);
    expect(isKpiLanguage("language-widgets")).toBe(true);
    expect(isKpiLanguage("language-json")).toBe(false);
  });
});
