import {describe, expect, it} from "vitest";
import {selectAssistantToolsForPrompt} from "@/lib/ai/tools/select-assistant-tools.ts";

const toolNames = (prompt: string, allowedModules: string[] = []) =>
  selectAssistantToolsForPrompt(prompt, allowedModules, {compact: true}).tools.map(t => t.function.name);

const writeToolNames = (prompt: string, allowedModules: string[] = []) =>
  selectAssistantToolsForPrompt(prompt, allowedModules, {compact: true}).writeTools.map(t => t.function.name);

describe("selectAssistantToolsForPrompt", () => {
  it("today's sales includes sales tools, not dish write tools", () => {
    const names = toolNames("show me today's sales");
    expect(names).toContain("get_sales_summary");
    expect(names).not.toContain("propose_create_dishes");
    expect(names).not.toContain("propose_update_dishes");
  });

  it("orders list includes operations tools", () => {
    const names = toolNames("list open orders");
    expect(names).toContain("get_orders");
  });

  it("add a dish includes propose_create_dishes when permitted", () => {
    const names = writeToolNames("add a dish called Margherita at $9", ["admin.dishes.create"]);
    expect(names).toContain("propose_create_dishes");
    expect(names).not.toContain("propose_update_dishes");
  });

  it("update dish price includes propose_update_dishes when permitted", () => {
    const names = writeToolNames("raise the price of dish #12 to $10", ["admin.dishes.update"]);
    expect(names).toContain("propose_update_dishes");
    expect(names).not.toContain("propose_create_dishes");
  });

  it("write tools are excluded without explicit permission", () => {
    const names = writeToolNames("add a dish called Test", ["reports.ai"]);
    expect(names).not.toContain("propose_create_dishes");
    expect(names).not.toContain("propose_update_dishes");
  });

  it("create permission does not grant update tool", () => {
    const names = writeToolNames("update dish #5 price to 12", ["admin.dishes.create"]);
    expect(names).not.toContain("propose_update_dishes");
  });
});
