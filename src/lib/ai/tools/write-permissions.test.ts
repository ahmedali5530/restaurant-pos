import {describe, expect, it} from "vitest";
import {canUseWriteTool, filterWriteToolsByPermissions} from "@/lib/ai/tools/write-permissions.ts";
import {filterToolsByPermissions} from "@/lib/ai/tools/permissions.ts";
import {AI_WRITE_TOOLS} from "@/lib/ai/tools/write-definitions.ts";

describe("canUseWriteTool", () => {
  it("denies by default with no modules granted", () => {
    expect(canUseWriteTool("propose_create_dishes", [])).toBe(false);
  });

  it("denies an unknown tool name (no module mapped)", () => {
    expect(canUseWriteTool("propose_delete_everything", ["admin.dishes.create"])).toBe(false);
  });

  it("allows only when the exact matching admin leaf is granted", () => {
    expect(canUseWriteTool("propose_create_dishes", ["admin.dishes.create"])).toBe(true);
    expect(canUseWriteTool("propose_update_dishes", ["admin.dishes.create"])).toBe(false);
    expect(canUseWriteTool("propose_update_dishes", ["admin.dishes.update"])).toBe(true);
  });

  it("does NOT treat a sibling admin.dishes leaf as sufficient", () => {
    // admin.dishes.import must not silently imply create/update
    expect(canUseWriteTool("propose_create_dishes", ["admin.dishes.import"])).toBe(false);
  });

  /**
   * Regression test for the gap flagged during planning: permissions.ts's
   * filterToolsByPermissions() treats "reports.ai" as a catch-all that grants
   * every tool passed to it. If write tools were ever filtered through THAT
   * function, any session with reports.ai (full AI report access, granted
   * before write tools existed) would silently gain write access with no
   * separate consent. Confirm that gap is real on the read-side filter, and
   * confirm the write-side filter is immune to it.
   */
  it("reports.ai does not grant write tools (write filter has no catch-all)", () => {
    const allowedModules = ["reports.ai"];

    // Demonstrates the catch-all behavior filterToolsByPermissions has by
    // design for read tools (this is intentional there, per permissions.ts).
    const readCheckViaCatchAll = filterToolsByPermissions(AI_WRITE_TOOLS, allowedModules);
    expect(readCheckViaCatchAll).toHaveLength(AI_WRITE_TOOLS.length); // catch-all would leak everything if reused

    // The actual write-tool filter must reject the same input.
    const allowed = filterWriteToolsByPermissions(AI_WRITE_TOOLS, allowedModules);
    expect(allowed).toHaveLength(0);
    expect(canUseWriteTool("propose_create_dishes", allowedModules)).toBe(false);
  });

  it("filterWriteToolsByPermissions only returns tools the modules explicitly cover", () => {
    const allowed = filterWriteToolsByPermissions(AI_WRITE_TOOLS, ["admin.dishes.create"]);
    expect(allowed.map(t => t.function.name)).toEqual(["propose_create_dishes"]);
  });
});
