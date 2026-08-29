import {describe, expect, it} from "vitest";
import {
  extractEmployeeNumberFromPrompt,
  isEmployeeDetailPrompt,
  isHrEmployeePrompt,
  resolveEmployeeQueryFromPrompt,
} from "@/lib/ai/employee-query.ts";
import {selectToolsForPrompt} from "@/lib/ai/tools/select-tools.ts";

const toolNames = (prompt: string) =>
  selectToolsForPrompt(prompt, "table", [], true).tools.map(tool => tool.function.name);

describe("employee-query", () => {
  it("extracts employee numbers from common phrasing", () => {
    expect(extractEmployeeNumberFromPrompt("give me details about employee# 00001")).toBe("00001");
    expect(extractEmployeeNumberFromPrompt("employee number 42")).toBe("42");
    expect(extractEmployeeNumberFromPrompt("employee:abc123")).toBeUndefined();
  });

  it("detects HR employee prompts vs POS users", () => {
    expect(isHrEmployeePrompt("give me details about employee# 00001")).toBe(true);
    expect(isHrEmployeePrompt("list users")).toBe(false);
    expect(isEmployeeDetailPrompt("give me details about employee# 00001")).toBe(true);
    expect(resolveEmployeeQueryFromPrompt("give me details about employee# 00001")).toEqual({
      employeeNumber: "00001",
    });
  });
});

describe("employee tool routing", () => {
  it("prioritizes get_employee_detail and excludes list_users", () => {
    const names = toolNames("give me details about employee# 00001");
    expect(names[0]).toBe("get_employee_detail");
    expect(names).toContain("list_employees");
    expect(names).not.toContain("list_users");
  });

  it("keeps list_users for POS user prompts", () => {
    const names = toolNames("list all users");
    expect(names).toContain("list_users");
    expect(names).not.toContain("get_employee_detail");
  });
});
