import {describe, expect, it} from "vitest";
import {
  guideLocaleFolder,
  isUserGuideHowToPrompt,
  lookupUserGuide,
  serializeUserGuideChapter,
  suggestUserGuideChapterForPath,
  type UserGuideChapter,
} from "@/lib/ai/user-guide.ts";

describe("guideLocaleFolder", () => {
  it("maps pt-BR to pt-br", () => {
    expect(guideLocaleFolder("pt-BR")).toBe("pt-br");
    expect(guideLocaleFolder("pt-br")).toBe("pt-br");
  });

  it("uses language base for regional codes", () => {
    expect(guideLocaleFolder("en-US")).toBe("en");
    expect(guideLocaleFolder("es")).toBe("es");
  });

  it("defaults empty to en", () => {
    expect(guideLocaleFolder("")).toBe("en");
  });
});

describe("suggestUserGuideChapterForPath", () => {
  it("maps back-office routes to overview chapters", () => {
    expect(suggestUserGuideChapterForPath("/inventory")).toBe("inventory-overview");
    expect(suggestUserGuideChapterForPath("/inventory/print/purchase/1")).toBe("inventory-overview");
    expect(suggestUserGuideChapterForPath("/hr")).toBe("hr-overview");
    expect(suggestUserGuideChapterForPath("/accounts")).toBe("accounts-overview");
    expect(suggestUserGuideChapterForPath("/integrations")).toBe("integrations");
    expect(suggestUserGuideChapterForPath("/tip-distribution")).toBe("tip-distribution");
    expect(suggestUserGuideChapterForPath("/clock")).toBe("session");
    expect(suggestUserGuideChapterForPath("/admin")).toBe("admin-overview");
    expect(suggestUserGuideChapterForPath("/reports")).toBe("reports-ops");
    expect(suggestUserGuideChapterForPath("/reports/sales-dashboard")).toBe("reports-ops");
  });

  it("returns null for unknown paths", () => {
    expect(suggestUserGuideChapterForPath("/menu")).toBeNull();
    expect(suggestUserGuideChapterForPath("")).toBeNull();
  });
});

describe("serializeUserGuideChapter", () => {
  const sample: UserGuideChapter = {
    title: "Purchases",
    intro: "Receive stock from suppliers.",
    sections: [
      {
        id: "post",
        title: "Post a purchase",
        steps: ["Open Purchases.", "Tap New."],
        image: "purchase.png",
        caption: "Should not appear",
        note: "Save before posting.",
        fields: [{name: "Supplier", effect: "Who you bought from"}],
      },
    ],
  };

  it("includes steps and fields and omits image filenames", () => {
    const text = serializeUserGuideChapter(sample);
    expect(text).toContain("# Purchases");
    expect(text).toContain("1. Open Purchases.");
    expect(text).toContain("- Supplier: Who you bought from");
    expect(text).toContain("Note: Save before posting.");
    expect(text).not.toContain("purchase.png");
    expect(text).not.toContain("Should not appear");
  });

  it("filters sections by query when matches exist", () => {
    const multi: UserGuideChapter = {
      title: "Orders",
      sections: [
        {id: "list", title: "List orders", steps: ["Open Orders."]},
        {id: "refund", title: "Refund an order", steps: ["Tap Refund."]},
      ],
    };
    const text = serializeUserGuideChapter(multi, {query: "refund"});
    expect(text).toContain("Refund an order");
    expect(text).not.toContain("List orders");
  });
});

describe("lookupUserGuide", () => {
  it("loads English chapter text", async () => {
    const result = await lookupUserGuide({chapter: "login", language: "en"});
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.chapter).toBe("login");
    expect(result.content).toContain("Login");
    expect(result.content).toMatch(/PIN|Pin/);
    expect(result.content).not.toContain(".png");
  });

  it("falls back to English for unknown language folder", async () => {
    const result = await lookupUserGuide({chapter: "login", language: "zz"});
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.language).toBe("en");
  });

  it("returns error for unknown chapter", async () => {
    const result = await lookupUserGuide({chapter: "not-a-chapter", language: "en"});
    expect(result).toHaveProperty("error");
  });
});

describe("isUserGuideHowToPrompt", () => {
  it("detects how-to prompts across languages", () => {
    expect(isUserGuideHowToPrompt("How do I post an inventory purchase?")).toBe(true);
    expect(isUserGuideHowToPrompt("Where is the purchases tab?")).toBe(true);
    expect(isUserGuideHowToPrompt("Cómo publico una compra?")).toBe(true);
    expect(isUserGuideHowToPrompt("Nasıl satın alma kaydı oluştururum?")).toBe(true);
    expect(isUserGuideHowToPrompt("كيف أنشر عملية شراء؟")).toBe(true);
  });

  it("does not treat data list prompts as how-to", () => {
    expect(isUserGuideHowToPrompt("Show yesterday's inventory purchases")).toBe(false);
    expect(isUserGuideHowToPrompt("List open orders")).toBe(false);
  });
});
