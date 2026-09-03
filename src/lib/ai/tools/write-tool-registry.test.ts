import {describe, expect, it} from "vitest";
import {detectWriteToolsForPrompt, getWriteModeForTool, listPermittedWriteTools, listWriteToolDefinitions} from "@/lib/ai/tools/write-tool-registry.ts";
import {buildWriteProposal} from "@/lib/ai/tools/write-tools.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {vi} from "vitest";

const t = (key: string, options?: any) => options?.defaultValue ?? key;

const toolNames = (
  prompt: string,
  modules: string[],
  domains?: Parameters<typeof detectWriteToolsForPrompt>[2]["domains"],
) => detectWriteToolsForPrompt(prompt, modules, {domains}).map(tool => tool.function.name);

describe("detectWriteToolsForPrompt", () => {
  it("routes category create when permitted", () => {
    const names = toolNames("add a new category called Desserts", ["admin.categories.create"]);
    expect(names).toContain("propose_create_categories");
    expect(names).not.toContain("propose_update_categories");
  });

  it("routes table update when permitted", () => {
    const names = toolNames("update table number 5 name to VIP", ["admin.tables.update"]);
    expect(names).toContain("propose_update_tables");
  });

  it("requires action verb for inventory items", () => {
    const reportOnly = toolNames("show inventory items report", ["inventory.items"]);
    expect(reportOnly).not.toContain("propose_create_inventory_items");

    const write = toolNames("add inventory item Flour code FLR-01", ["inventory.items"]);
    expect(write).toContain("propose_create_inventory_items");
  });

  it("routes dish ingredients separately from dishes", () => {
    const names = toolNames(
      "add ingredient Tomato to dish #12",
      ["admin.dishes.create"],
    );
    expect(names).toContain("propose_create_dish_ingredients");
    expect(names).not.toContain("propose_create_dishes");
  });

  it("routes scheduled shifts for HR scheduling permission", () => {
    const names = toolNames(
      "add a scheduled shift for employee 101 tomorrow 9am-5pm",
      ["hr.scheduling"],
    );
    expect(names).toContain("propose_create_scheduled_shifts");
  });

  it("routes floors, taxes, discounts in manage phase", () => {
    expect(toolNames("create a new floor Mezzanine", ["admin.floors.create"]))
      .toContain("propose_create_floors");
    expect(toolNames("add tax GST 16%", ["admin.taxes.create"]))
      .toContain("propose_create_taxes");
    expect(toolNames("create discount Staff 10%", ["admin.discounts.create"]))
      .toContain("propose_create_discounts");
  });

  it("routes HR employees and departments", () => {
    expect(toolNames("hire new employee John number E-99", ["hr.employees"]))
      .toContain("propose_create_employees");
    expect(toolNames("add department Kitchen", ["hr.departments"]))
      .toContain("propose_create_departments");
  });

  it("routes dish update via write intent and sales domain", () => {
    const names = toolNames("change the price to 12", ["admin.dishes.update"], ["sales"]);
    expect(names).toContain("propose_update_dishes");
  });

  it("listPermittedWriteTools returns every tool the modules cover", () => {
    const names = listPermittedWriteTools(["admin.dishes.update"]).map(tool => tool.function.name);
    expect(names).toContain("propose_update_dishes");
    expect(names).not.toContain("propose_create_categories");
  });
});

describe("getWriteModeForTool", () => {
  it("resolves create and update modes", () => {
    expect(getWriteModeForTool("propose_create_categories")).toBe("create");
    expect(getWriteModeForTool("propose_update_tables")).toBe("update");
    expect(getWriteModeForTool("unknown_tool")).toBeNull();
  });
});

describe("listWriteToolDefinitions", () => {
  it("every registered tool has a function name", () => {
    const tools = listWriteToolDefinitions();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.function.name).toBeTruthy();
    }
  });
});

describe("buildWriteProposal categories", () => {
  it("builds a category create proposal", async () => {
    const db: ImportDbLike = {
      query: vi.fn(async () => [[]]),
    };
    const proposal = await buildWriteProposal(
      "propose_create_categories",
      {categories: [{name: "Desserts", priority: 1}]},
      {db, t},
    );
    expect(proposal.configId).toBe("categories");
    expect(proposal.mode).toBe("create");
    expect(proposal.records).toHaveLength(1);
  });
});
