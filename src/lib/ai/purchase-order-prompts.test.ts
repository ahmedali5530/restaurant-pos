import {describe, expect, it} from "vitest";
import {isOrderListByStatusPrompt} from "@/lib/ai/order-query.ts";
import {
  inferPurchaseOrderStatusesFromPrompt,
  isPurchaseOrderPrompt,
} from "@/lib/ai/purchase-order-query.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

describe("isPurchaseOrderPrompt", () => {
  it("detects purchase order prompts", () => {
    expect(isPurchaseOrderPrompt("Open purchase orders awaiting approval")).toBe(true);
    expect(isPurchaseOrderPrompt("purchase orders pending approval")).toBe(true);
    expect(isPurchaseOrderPrompt("List POs this month")).toBe(true);
    expect(isPurchaseOrderPrompt("Show PO #12")).toBe(true);
  });

  it("does not treat POS product acronym as purchase order", () => {
    expect(isPurchaseOrderPrompt("Show POS sales today")).toBe(false);
  });

  it("does not treat normal customer order prompts as purchase orders", () => {
    expect(isPurchaseOrderPrompt("Show me orders with in progress status")).toBe(false);
    expect(isPurchaseOrderPrompt("Pending delivery orders")).toBe(false);
  });
});

describe("purchase order vs POS order routing", () => {
  it("does not route PO prompts to get_orders fast-path detector", () => {
    expect(isOrderListByStatusPrompt("Open purchase orders awaiting approval")).toBe(false);
    expect(isOrderListByStatusPrompt("purchase orders pending approval")).toBe(false);
  });

  it("still detects normal pending order prompts", () => {
    expect(isOrderListByStatusPrompt("Show pending orders")).toBe(true);
  });

  it("includes get_purchase_orders in compact inventory tools", () => {
    const names = toolNames("Open purchase orders awaiting approval");
    expect(names).toContain("get_purchase_orders");
    expect(names).not.toContain("get_orders");
  });

  it("routes purchases to inventory documents, not purchase orders", () => {
    const names = toolNames("Inventory purchase movements this week");
    expect(names).toContain("get_inventory_documents");
    expect(names).not.toContain("get_purchase_orders");
  });

  it("infers Pending Approval status", () => {
    expect(inferPurchaseOrderStatusesFromPrompt("Open purchase orders awaiting approval")).toEqual([
      "Pending Approval",
    ]);
    expect(inferPurchaseOrderStatusesFromPrompt("purchase orders pending approval")).toEqual([
      "Pending Approval",
    ]);
  });

  it("does not treat bare pending / procurement wording as Pending Approval only", () => {
    expect(inferPurchaseOrderStatusesFromPrompt(
      "show me purchase orders and whats pending to procurement",
    )).toEqual([]);
  });

  it("returns open statuses for procurement-only prompts", () => {
    expect(inferPurchaseOrderStatusesFromPrompt("what is pending to procurement")).toEqual([
      "Draft",
      "Pending Approval",
      "Approved",
    ]);
  });

  it("returns no status filter for a general PO list", () => {
    expect(inferPurchaseOrderStatusesFromPrompt("show me purchase orders")).toEqual([]);
  });
});
