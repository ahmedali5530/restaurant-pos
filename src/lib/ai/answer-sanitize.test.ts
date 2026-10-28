import {describe, expect, it} from "vitest";
import {
  looksLikeLeakedToolMarkup,
  sanitizeAssistantAnswer,
  stripLeakedToolMarkup,
} from "@/lib/ai/answer-sanitize.ts";

describe("answer-sanitize", () => {
  it("detects DSML tool markup leaks", () => {
    const leaked = `<|DSML|calls> <|DSML|invoke name="list_menu_items"></|DSML|invoke> </|DSML|calls>`;
    expect(looksLikeLeakedToolMarkup(leaked)).toBe(true);
  });

  it("strips leaked markup to empty when that is all there is", () => {
    const leaked = `<|DSML|calls> <|DSML|invoke name="list_menu_items"></|DSML|invoke> </|DSML|calls>`;
    expect(stripLeakedToolMarkup(leaked)).toBe("");
    expect(sanitizeAssistantAnswer(leaked)).toBe("");
  });

  it("keeps normal answers", () => {
    const answer = "Here are dishes with no ingredients: Burger, Salad.";
    expect(sanitizeAssistantAnswer(answer)).toBe(answer);
  });

  it("treats short tool-name dumps as leaked markup", () => {
    expect(sanitizeAssistantAnswer('invoke name="get_dish_recipe"')).toBe("");
    expect(sanitizeAssistantAnswer("get_dish_recipe\nlist_menu_items")).toBe("");
  });
});
