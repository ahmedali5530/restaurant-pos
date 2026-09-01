import {describe, expect, it} from "vitest";
import {
  DISH_WRITE_KEYWORDS,
  WRITE_INTENT_PATTERN,
} from "@/lib/ai/tools/write-intent-i18n.ts";
import {selectAssistantToolsForPrompt} from "@/lib/ai/tools/select-assistant-tools.ts";

describe("write-intent-i18n", () => {
  it("detects Turkish create/add verbs", () => {
    expect(WRITE_INTENT_PATTERN.test("9 TL'ye yeni Margherita yemeği ekle")).toBe(true);
    expect(WRITE_INTENT_PATTERN.test("yeni kategori oluştur")).toBe(true);
  });

  it("detects English create verbs", () => {
    expect(WRITE_INTENT_PATTERN.test("add a dish called Margherita")).toBe(true);
  });

  it("does not treat read-only prompts as write intent", () => {
    expect(WRITE_INTENT_PATTERN.test("bugünkü satışları göster")).toBe(false);
    expect(WRITE_INTENT_PATTERN.test("show me today's sales")).toBe(false);
  });

  it("matches Turkish dish terms", () => {
    expect(DISH_WRITE_KEYWORDS.test("Margherita yemeği")).toBe(true);
    expect(DISH_WRITE_KEYWORDS.test("menü kalemi ekle")).toBe(true);
  });
});

describe("selectAssistantToolsForPrompt Turkish writes", () => {
  const writeToolNames = (prompt: string, allowedModules: string[] = []) =>
    selectAssistantToolsForPrompt(prompt, allowedModules, {compact: true}).writeTools.map(t => t.function.name);

  it("includes propose_create_dishes for Turkish add-dish prompt when permitted", () => {
    const names = writeToolNames(
      "9 TL'ye yeni Margherita yemeği ekle",
      ["admin.dishes.create"],
    );
    expect(names).toContain("propose_create_dishes");
  });
});
