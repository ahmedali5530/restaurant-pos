import {describe, expect, it} from "vitest";
import {FRAUD_AUDIT_TOOL_NAMES, isFraudSuspiciousPrompt} from "@/lib/ai/fraud-query.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

describe("isFraudSuspiciousPrompt", () => {
  it("detects suspicious activity prompts", () => {
    expect(isFraudSuspiciousPrompt("Show suspicious cash register activity this week")).toBe(true);
  });

  it("does not flag normal sales prompts", () => {
    expect(isFraudSuspiciousPrompt("Top 10 dishes by revenue this week")).toBe(false);
  });
});

describe("selectToolsForPrompt fraud routing", () => {
  it("includes audit tools including activity log for suspicious prompts", () => {
    const names = toolNames("Show suspicious void and discount activity this week");
    for (const toolName of FRAUD_AUDIT_TOOL_NAMES) {
      expect(names).toContain(toolName);
    }
  });
});
