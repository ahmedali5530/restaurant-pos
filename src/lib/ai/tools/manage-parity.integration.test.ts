import {describe, expect, it} from "vitest";
import {detectDomainsForPrompt} from "@/lib/ai/tools/select-tools.ts";
import {AI_MANAGE_READ_TOOLS} from "@/lib/ai/tools/manage-tool-definitions.ts";
import {MANAGE_TOOL_PERMISSION_MODULES} from "@/lib/ai/tools/manage-permissions.ts";
import {AI_REPORT_TOOL_CATEGORIES} from "@/lib/ai/tools/categories.ts";
import {detectWriteToolsForPrompt} from "@/lib/ai/tools/write-tool-registry.ts";

const manageToolNames = () => AI_MANAGE_READ_TOOLS.map(t => t.function.name);

describe("manage parity routing", () => {
  const manageModules = [
    "admin.tables",
    "admin.floors",
    "admin.discounts.create",
    "admin.users",
    "admin.roles",
    "admin.dishes",
    "admin.modifier_groups",
    "admin.coupons.create",
    "admin.extras",
    "admin.printers",
    "admin.print_settings",
    "admin.tips_definition",
    "admin.kitchens.update",
    "inventory.purchases",
  ];

  it("registers enriched and detail Manage read tools", () => {
    const names = new Set(manageToolNames());
    for (const tool of [
      "get_table_detail",
      "get_dish_detail",
      "list_dish_modifiers",
      "get_discount_detail",
      "get_coupon_detail",
      "get_extra_detail",
      "get_role_detail",
      "get_printer_detail",
      "get_print_settings",
      "get_tip_distribution",
    ]) {
      expect(names.has(tool)).toBe(true);
      expect(MANAGE_TOOL_PERMISSION_MODULES[tool]).toBeTruthy();
      expect(AI_REPORT_TOOL_CATEGORIES.manage).toContain(tool);
    }
  });

  it.each([
    ["tables on Delivery floor", "manage"],
    ["list active automatic discounts", "manage"],
    ["list users", "manage"],
    ["list modifier groups", "manage"],
    ["show discount targets for Happy Hour", "manage"],
    ["show role modules for Manager", "manage"],
    ["list dish modifiers for Margherita", "manage"],
    ["show print settings", "manage"],
    ["show tip distribution weights", "manage"],
    ["table detail for table 12", "manage"],
  ])("prompt %s detects manage domain", (prompt, domain) => {
    expect(detectDomainsForPrompt(prompt)).toContain(domain);
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
    const names = detectWriteToolsForPrompt(prompt, manageModules, {
      domains: detectDomainsForPrompt(prompt),
    }).map(t => t.function.name);
    expect(names).toContain(expected);
  });
});
