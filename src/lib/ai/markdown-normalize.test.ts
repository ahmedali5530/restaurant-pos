import {describe, expect, it} from "vitest";
import {normalizeAiMarkdown} from "@/lib/ai/markdown-normalize.ts";

describe("normalizeAiMarkdown", () => {
  it("unwraps a fenced markdown block", () => {
    const input = "```markdown\n| A | B |\n| - | - |\n| 1 | 2 |\n```";
    expect(normalizeAiMarkdown(input)).toBe("| A | B |\n| - | - |\n| 1 | 2 |");
  });

  it("inserts blank line before tables following prose", () => {
    const input = "Summary:\n| Name | Value |\n| --- | --- |\n| Tax | 5 |";
    expect(normalizeAiMarkdown(input)).toBe(
      "Summary:\n\n| Name | Value |\n| --- | --- |\n| Tax | 5 |",
    );
  });
});
