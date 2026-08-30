import {describe, expect, it} from "vitest";
import {WRITE_TOOL_REGISTRY} from "@/lib/ai/tools/write-tool-entries.ts";
import {listWriteToolDefinitions} from "@/lib/ai/tools/write-tool-registry.ts";
import {selectAssistantToolsForPrompt} from "@/lib/ai/tools/select-assistant-tools.ts";

const REGISTERED_CONFIG_IDS = new Set(WRITE_TOOL_REGISTRY.map(entry => entry.configId));

describe("assistant import-config parity", () => {
  it("registers inventory transaction write tools", () => {
    for (const id of [
      "inventory_purchases",
      "inventory_wastes",
      "inventory_issues",
      "inventory_adjustments",
      "inventory_suppliers",
      "inventory_locations",
    ]) {
      expect(REGISTERED_CONFIG_IDS.has(id)).toBe(true);
    }
  });

  it("registers HR and accounts write tools", () => {
    for (const id of [
      "positions",
      "cost_centers",
      "leave_requests",
      "time_entries",
      "accounts",
      "journal_entries",
    ]) {
      expect(REGISTERED_CONFIG_IDS.has(id)).toBe(true);
    }
  });

  it("exposes get_kitchen_detail for manage kitchen prompts", () => {
    const names = selectAssistantToolsForPrompt(
      "show dishes on Grill kitchen",
      ["admin.kitchens"],
      {compact: true},
    ).tools.map(t => t.function.name);
    expect(names).toContain("get_kitchen_detail");
  });

  it("every write tool in registry has a definition", () => {
    const defined = new Set(listWriteToolDefinitions().map(t => t.function.name));
    for (const entry of WRITE_TOOL_REGISTRY) {
      expect(defined.has(entry.createToolName)).toBe(true);
      if (entry.updateToolName) expect(defined.has(entry.updateToolName)).toBe(true);
      if (entry.deleteToolName) expect(defined.has(entry.deleteToolName)).toBe(true);
    }
  });
});
