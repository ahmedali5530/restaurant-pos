import {describe, expect, it} from "vitest";
import {isAssistantWidgetPath} from "@/lib/ai/assistant-widget-visibility.ts";

describe("isAssistantWidgetPath", () => {
  it("allows back-office routes", () => {
    expect(isAssistantWidgetPath("/admin")).toBe(true);
    expect(isAssistantWidgetPath("/inventory")).toBe(true);
    expect(isAssistantWidgetPath("/inventory/print/purchase/doc:1")).toBe(true);
    expect(isAssistantWidgetPath("/reports/sales-summary")).toBe(true);
    expect(isAssistantWidgetPath("/tip-distribution")).toBe(true);
    expect(isAssistantWidgetPath("/accounts")).toBe(true);
    expect(isAssistantWidgetPath("/hr")).toBe(true);
    expect(isAssistantWidgetPath("/integrations")).toBe(true);
    expect(isAssistantWidgetPath("/clock")).toBe(true);
  });

  it("hides cashier-facing routes", () => {
    expect(isAssistantWidgetPath("/")).toBe(false);
    expect(isAssistantWidgetPath("/menu")).toBe(false);
    expect(isAssistantWidgetPath("/orders")).toBe(false);
    expect(isAssistantWidgetPath("/summary")).toBe(false);
    expect(isAssistantWidgetPath("/kitchen")).toBe(false);
    expect(isAssistantWidgetPath("/delivery")).toBe(false);
    expect(isAssistantWidgetPath("/closing")).toBe(false);
    expect(isAssistantWidgetPath("/order-display")).toBe(false);
    expect(isAssistantWidgetPath("/settings")).toBe(false);
  });

  it("hides the dedicated AI report page", () => {
    expect(isAssistantWidgetPath("/reports/ai")).toBe(false);
  });
});
