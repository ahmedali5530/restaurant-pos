import {describe, expect, it} from "vitest";
import {detectDomainsForPrompt, selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (result: ReturnType<typeof selectToolsForPrompt>) =>
  result.tools.map(tool => tool.function.name);

describe("selectToolsForPrompt", () => {
  it("returns all tools in non-compact mode", () => {
    const result = selectToolsForPrompt("Top 10 dishes this week", "table", [], false);
    expect(result.tools.length).toBeGreaterThan(40);
    expect(result.domains).toEqual([]);
  });

  it("routes sales prompts to sales tools only", () => {
    const result = selectToolsForPrompt("Top 10 dishes by revenue this week", "table", [], true);
    const names = toolNames(result);

    expect(result.domains).toContain("sales");
    expect(names).toContain("resolve_date_range");
    expect(names).toContain("get_top_selling_dishes");
    expect(names).not.toContain("get_waste_summary");
    expect(names).not.toContain("get_overtime_report");
  });

  it("routes waste prompts to inventory tools", () => {
    const result = selectToolsForPrompt("Summarize waste by item for last week", "table", [], true);
    const names = toolNames(result);

    expect(result.domains).toContain("inventory");
    expect(names).toContain("get_waste_summary");
    expect(names).not.toContain("get_top_selling_dishes");
  });

  it("routes overtime prompts to labor tools", () => {
    const result = selectToolsForPrompt("Overtime report last month", "table", [], true);
    const names = toolNames(result);

    expect(result.domains).toContain("labor");
    expect(names).toContain("get_overtime_report");
    expect(names).not.toContain("get_sales_summary");
  });

  it("includes analysis tools for comparison prompts", () => {
    const result = selectToolsForPrompt("Compare net sales this week vs last week", "table", [], true);
    const names = toolNames(result);

    expect(result.domains).toContain("sales");
    expect(result.domains).toContain("analysis");
    expect(names).toContain("compare_periods");
  });

  it("includes render_chart for chart format", () => {
    const result = selectToolsForPrompt("Daily net sales", "chart", [], true);
    const names = toolNames(result);

    expect(result.domains).toContain("chart");
    expect(names).toContain("render_chart");
  });

  it("uses compact tool schemas in compact mode", () => {
    const result = selectToolsForPrompt("Top 10 dishes this week", "table", [], true);
    const topDishes = result.tools.find(tool => tool.function.name === "get_top_selling_dishes");

    expect(topDishes?.function.description).toBe("Top dishes by revenue or quantity.");
  });

  it("filters tools by permissions", () => {
    const result = selectToolsForPrompt(
      "Top 10 dishes this week",
      "table",
      ["Labor Dashboard"],
      true,
    );
    const names = toolNames(result);

    expect(names).not.toContain("get_top_selling_dishes");
    expect(names).not.toContain("resolve_date_range");
  });

  it("detects operations domain for order status prompts", () => {
    const domains = detectDomainsForPrompt("Show me orders with in progress status", "table");
    expect(domains).toContain("operations");
  });
});
