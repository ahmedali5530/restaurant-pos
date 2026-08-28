import {describe, expect, it, vi} from "vitest";

vi.mock("@/api/reports/shared/filters.ts", () => ({
  getBusinessDateContext: () => "2026-08-28",
}));

vi.mock("@/lib/datetime.ts", () => ({
  getAppTimezone: () => "UTC",
}));

import {
  AI_ASSISTANT_WRITE_RULES,
  getAiAssistantSystemPrompt,
  getAiReportSystemPrompt,
} from "@/lib/ai/schema.ts";

describe("getAiAssistantSystemPrompt", () => {
  it("includes assistant persona and write rules in compact mode", () => {
    const prompt = getAiAssistantSystemPrompt(["sales"], true);

    expect(prompt).toContain("Your name is");
    expect(prompt).toContain(AI_ASSISTANT_WRITE_RULES);
    expect(prompt).toContain("propose_*");
    expect(prompt).toContain("get_sales_summary");
  });

  it("omits full workflow in compact mode", () => {
    const compact = getAiAssistantSystemPrompt(["sales"], true);
    const full = getAiReportSystemPrompt("table", [], false);

    expect(compact).not.toContain("Workflow:");
    expect(full).toContain("Workflow:");
    expect(compact.length).toBeLessThan(full.length);
  });

  it("uses full report prompt plus write rules when compact is off", () => {
    const assistant = getAiAssistantSystemPrompt(["inventory"], false);
    const report = getAiReportSystemPrompt("table", [], false);

    expect(assistant).toContain(report);
    expect(assistant).toContain(AI_ASSISTANT_WRITE_RULES);
    expect(assistant).toContain("Workflow:");
  });

  it("includes write tools list when provided", () => {
    const prompt = getAiAssistantSystemPrompt(["sales"], true, ["propose_update_dishes"]);
    expect(prompt).toContain("propose_update_dishes");
    expect(prompt).toContain("NOT read-only");
  });

  it("includes domain hints only for matched domains in compact mode", () => {
    const salesOnly = getAiAssistantSystemPrompt(["sales"], true);
    const inventoryOnly = getAiAssistantSystemPrompt(["inventory"], true);

    expect(salesOnly).toContain("get_sales_summary");
    expect(salesOnly).not.toContain("forecast_inventory_need");
    expect(inventoryOnly).toContain("forecast_inventory_need");
  });
});
