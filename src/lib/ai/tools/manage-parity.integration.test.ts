import {describe, expect, it} from "vitest";
import {selectAssistantToolsForPrompt} from "@/lib/ai/tools/select-assistant-tools.ts";

const toolNames = (prompt: string, allowedModules: string[] = []) =>
  selectAssistantToolsForPrompt(prompt, allowedModules, {compact: true}).tools.map(t => t.function.name);

describe("manage parity routing", () => {
  const manageModules = [
    "admin.tables",
    "admin.floors",
    "admin.discounts.create",
    "admin.users",
    "admin.modifier_groups",
    "admin.coupons.create",
    "admin.kitchens.update",
    "inventory.purchases",
  ];

  it.each([
    ["tables on Delivery floor", ["list_tables", "list_floors"]],
    ["list active automatic discounts", ["list_discounts"]],
    ["list users", ["list_users"]],
    ["list modifier groups", ["list_modifier_groups"]],
  ])("prompt %s includes %j", (prompt, expected) => {
    const names = toolNames(prompt, manageModules);
    for (const tool of expected) {
      expect(names).toContain(tool);
    }
  });

  it.each([
    ["add table 20 on Delivery floor", "propose_create_tables"],
    ["buy 2 get 1 free on Classic Pizzas category", "propose_create_discounts"],
    ["create user John PIN 1234 role Manager", "propose_create_users"],
    ["create modifier group Sizes", "propose_create_modifier_groups"],
    ["create coupon SAVE10", "propose_create_coupons"],
    ["add Pizza to Grill kitchen", "propose_update_kitchens"],
    ["record purchase 5kg flour from Supplier A to Main Store", "propose_create_purchases"],
  ])("write prompt %s includes %s", (prompt, expected) => {
    const names = selectAssistantToolsForPrompt(prompt, manageModules, {compact: true}).writeTools.map(
      t => t.function.name,
    );
    expect(names).toContain(expected);
  });
});
