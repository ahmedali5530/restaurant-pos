import {describe, expect, it} from "vitest";
import {
  inferInventoryDocumentStatusFilter,
  inferInventoryDocumentType,
  isPosOrderVoidPrompt,
  isPurchaseLedgerPrompt,
  resolveInventoryDocumentQueryFromPrompt,
} from "@/lib/ai/inventory-operation-query.ts";
import {isPurchaseOrderPrompt} from "@/lib/ai/purchase-order-query.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

describe("inventory-operation-query", () => {
  it("detects posted purchases vs purchase orders", () => {
    expect(isPurchaseLedgerPrompt("show purchases this week")).toBe(true);
    expect(isPurchaseLedgerPrompt("inventory purchase movements this week")).toBe(true);
    expect(isPurchaseOrderPrompt("open purchase orders awaiting approval")).toBe(true);
    expect(isPurchaseLedgerPrompt("open purchase orders awaiting approval")).toBe(false);
    expect(inferInventoryDocumentType("list purchases from last month")).toBe("purchase");
    expect(inferInventoryDocumentType("open purchase orders awaiting approval")).toBeNull();
  });

  it("detects other inventory document types", () => {
    expect(inferInventoryDocumentType("inventory issues this week")).toBe("issue");
    expect(inferInventoryDocumentType("purchase returns last month")).toBe("purchase_return");
    expect(inferInventoryDocumentType("stock transfers today")).toBe("transfer");
    expect(inferInventoryDocumentType("inventory waste report")).toBe("waste");
    expect(inferInventoryDocumentType("stock adjustments this week")).toBe("adjustment");
  });

  it("distinguishes voided inventory purchases from POS order voids", () => {
    expect(inferInventoryDocumentType("show me voided purchases")).toBe("purchase");
    expect(inferInventoryDocumentStatusFilter("show me voided purchases")).toBe("voided");
    expect(isPosOrderVoidPrompt("show me voided purchases")).toBe(false);
    expect(isPosOrderVoidPrompt("show voided dishes this week")).toBe(true);
    expect(isPosOrderVoidPrompt("voided items on orders")).toBe(true);

    const resolved = resolveInventoryDocumentQueryFromPrompt("show me voided purchases");
    expect(resolved).toEqual({
      documentType: "purchase",
      documentStatus: "voided",
      phrase: undefined,
    });
  });
});

describe("inventory tool routing", () => {
  it("prefers inventory documents and excludes PO tool for purchase prompts", () => {
    const names = toolNames("show purchases this week");
    expect(names).toContain("get_inventory_documents");
    expect(names).not.toContain("get_purchase_orders");
    expect(names[0]).toBe("get_inventory_documents");
  });

  it("excludes POS void tools for voided purchase prompts", () => {
    const names = toolNames("show me voided purchases");
    expect(names).toContain("get_inventory_documents");
    expect(names).not.toContain("get_voids");
    expect(names).not.toContain("get_void_and_cancel_summary");
    expect(names).not.toContain("get_purchase_orders");
    expect(names[0]).toBe("get_inventory_documents");
  });

  it("keeps purchase order tool for PO prompts", () => {
    const names = toolNames("open purchase orders awaiting approval");
    expect(names).toContain("get_purchase_orders");
  });

  it("keeps POS void tools for order void prompts", () => {
    const names = toolNames("show voided dishes this week");
    expect(names).toContain("get_voids");
    expect(names).not.toContain("get_inventory_documents");
  });
});
