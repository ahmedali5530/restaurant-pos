import {describe, expect, it} from "vitest";
import {
  extractOrderIdFromPrompt,
  isOrderDetailPrompt,
  isOrderListByStatusPrompt,
  resolveOrderDetailQueryFromPrompt,
} from "@/lib/ai/order-query.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

describe("extractOrderIdFromPrompt", () => {
  it("extracts order: record ids", () => {
    expect(
      extractOrderIdFromPrompt(
        "get everything for order id order:pkzurx2a73wxstql09bv including tracking",
      ),
    ).toBe("order:pkzurx2a73wxstql09bv");
  });
});

describe("isOrderDetailPrompt", () => {
  it("detects concrete order dossier prompts", () => {
    expect(
      isOrderDetailPrompt(
        "get everything for order id order:pkzurx2a73wxstql09bv including tracking, items, voids",
      ),
    ).toBe(true);
  });

  it("detects order detail phrasing", () => {
    expect(isOrderDetailPrompt("Show order detail and full history of order")).toBe(true);
  });
});

describe("isOrderListByStatusPrompt vs detail", () => {
  it("does not treat order dossier as status list", () => {
    expect(
      isOrderListByStatusPrompt(
        "get everything for order id order:pkzurx2a73wxstql09bv including voids",
      ),
    ).toBe(false);
  });

  it("still routes status lists", () => {
    expect(isOrderListByStatusPrompt("Show me orders with in progress status")).toBe(true);
  });
});

describe("selectToolsForPrompt order detail", () => {
  it("includes get_order_detail for dossier prompts", () => {
    const prompt = "Get everything for order id order:pkzurx2a73wxstql09bv including items and tracking";
    const names = toolNames(prompt);
    expect(names).toContain("get_order_detail");
    expect(selectToolsForPrompt(prompt, "table", [], true).domains).toContain("operations");
  });
});

describe("resolveOrderDetailQueryFromPrompt", () => {
  it("returns orderId from prompt", () => {
    expect(
      resolveOrderDetailQueryFromPrompt("order detail for order:abc123xyz"),
    ).toEqual({
      orderId: "order:abc123xyz",
      autoId: undefined,
      invoiceNumber: undefined,
    });
  });
});
