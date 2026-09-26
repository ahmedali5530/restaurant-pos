import {describe, expect, it} from "vitest";
import {isUserGuideHowToPrompt} from "@/lib/ai/user-guide.ts";
import {resolveInventoryDocumentQueryFromPrompt} from "@/lib/ai/inventory-operation-query.ts";

/**
 * Documents the agent rule: how-to prompts skip inventory/employee fast paths
 * so lookup_user_guide can run; document-list prompts still resolve for fast path.
 */
describe("assistant guide vs inventory fast-path routing", () => {
  it("how-to purchase prompt is how-to and may still match document nouns", () => {
    const prompt = "How do I post an inventory purchase?";
    expect(isUserGuideHowToPrompt(prompt)).toBe(true);
    // Document query may match; the agent must skip fast path when how-to is true.
    expect(resolveInventoryDocumentQueryFromPrompt(prompt)).not.toBeNull();
  });

  it("yesterday purchases is data-only — not how-to", () => {
    const prompt = "Show yesterday's inventory purchases";
    expect(isUserGuideHowToPrompt(prompt)).toBe(false);
    expect(resolveInventoryDocumentQueryFromPrompt(prompt)).not.toBeNull();
  });
});
