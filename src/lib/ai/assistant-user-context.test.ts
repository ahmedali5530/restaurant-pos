import {describe, expect, it} from "vitest";
import {
  buildAssistantUserContextFromSnapshot,
  formatAssistantUserContext,
  summarizeAccessAreas,
} from "@/lib/ai/assistant-user-context.ts";
import type {User} from "@/api/model/user.ts";
import type {Employee} from "@/api/model/employee.ts";

describe("assistant user context", () => {
  it("summarizes access areas from leaf modules", () => {
    expect(summarizeAccessAreas(["reports.sales_summary", "admin.dishes", "menu"])).toEqual(
      expect.arrayContaining(["reports", "admin", "menu"]),
    );
  });

  it("builds a credential-free snapshot with role, shift, and employee", () => {
    const user = {
      id: "user:abc",
      first_name: "Ada",
      last_name: "Lovelace",
      login: "ada",
      password: "secret",
      user_role: {id: "user_role:1", name: "Manager", roles: ["reports.ai", "admin.dishes"]},
      user_shift: {
        id: "shift:1",
        name: "Morning",
        start_time: "09:00",
        end_time: "17:00",
        ends_next_day: false,
      },
    } as User;

    const employee = {
      id: "employee:1",
      employee_number: "00042",
      first_name: "Ada",
      last_name: "Lovelace",
      employment_status: "active",
      employment_type: "full_time",
      department: {name: "Kitchen"} as any,
      position: {name: "Chef"} as any,
      manager: {first_name: "Grace", last_name: "Hopper"} as any,
    } as Employee;

    const ctx = buildAssistantUserContextFromSnapshot(user, employee);
    expect(ctx.user.display_name).toBe("Ada Lovelace");
    expect(ctx.user).not.toHaveProperty("login");
    expect(ctx.user).not.toHaveProperty("password");
    expect(ctx.role?.name).toBe("Manager");
    expect(ctx.role?.access_areas).toEqual(expect.arrayContaining(["reports", "admin"]));
    expect(ctx.shift?.name).toBe("Morning");
    expect(ctx.employee?.employee_number).toBe("00042");
    expect(ctx.employee?.department).toBe("Kitchen");
    expect(ctx.employee?.manager).toBe("Grace Hopper");

    const block = formatAssistantUserContext(ctx);
    expect(block).toContain("Ada Lovelace");
    expect(block).toContain("Manager");
    expect(block).toContain("Morning");
    expect(block).toContain("#00042");
    expect(block).toContain("Kitchen");
    expect(block).not.toContain("secret");
    expect(block).not.toContain("ada");
  });

  it("formats an empty context as empty string", () => {
    expect(formatAssistantUserContext(null)).toBe("");
  });
});
