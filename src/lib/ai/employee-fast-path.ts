import type {DbClient} from "@/api/reports/shared/types.ts";
import {getEmployeeDetail} from "@/api/reports/hr/employees.ts";
import {resolveEmployeeQueryFromPrompt} from "@/lib/ai/employee-query.ts";

export type EmployeeFastPathResult = {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  instruction: string;
};

export const tryEmployeeDetailFastPath = async (
  db: DbClient,
  prompt: string,
  options: {onToolStart?: (name: string) => void} = {},
): Promise<EmployeeFastPathResult | null> => {
  const query = resolveEmployeeQueryFromPrompt(prompt);
  if (!query) {
    return null;
  }

  options.onToolStart?.("get_employee_detail");
  const args = {
    ...(query.employeeId ? {employee_id: query.employeeId} : {}),
    ...(query.employeeNumber ? {employee_number: query.employeeNumber} : {}),
  };
  const result = await getEmployeeDetail(db, {
    employeeId: query.employeeId,
    employeeNumber: query.employeeNumber,
  });

  return {
    toolName: "get_employee_detail",
    args,
    result,
    instruction:
      `${prompt}\n\nget_employee_detail returned:\n${JSON.stringify(result)}\n\n`
      + "Summarize the full HR employee dossier: profile, current pay, upcoming/recent shifts, attendance/time entries, "
      + "leave balances and requests, recent payroll, adjustments, documents, performance notes, and assignment history. "
      + "Include every linked section that has data — do not show only the header. This is HR, not POS users.",
  };
};
