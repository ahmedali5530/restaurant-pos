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

  it("includes dish update tools for parent tab permission", () => {
    const names = writeToolNames("update dish #5 price to 12", ["admin.dishes"]);
    expect(names).toContain("propose_update_dishes");
  });

  it("routes dish update via write intent and sales domain when keywords are weak", () => {
    const names = writeToolNames("change the price to 12", ["admin.dishes.update"]);
    expect(names).toContain("propose_update_dishes");
  });

  it("includes all permitted write tools when prompt has write intent", () => {
    const names = writeToolNames("please update something", ["admin.dishes.update", "admin.categories.create"]);
    expect(names).toContain("propose_update_dishes");
    expect(names).toContain("propose_create_categories");
    expect(names).not.toContain("propose_create_dishes");
  });

  it("tables on delivery floor includes manage read tools", () => {
    const names = toolNames("show tables on delivery floor", ["admin.tables", "admin.floors"]);
    expect(names).toContain("list_tables");
    expect(names).toContain("list_floors");
  });

  it("bxgy discount prompt includes discount write tools when permitted", () => {
    const names = writeToolNames("create buy 2 get 1 free on Classic Pizzas", ["admin.discounts.create"]);
    expect(names).toContain("propose_create_discounts");
  });

  it("list modifier groups routes to manage read tools", () => {
    const names = toolNames("list modifier groups", ["admin.modifier_groups"]);
    expect(names).toContain("list_modifier_groups");
  });
});
