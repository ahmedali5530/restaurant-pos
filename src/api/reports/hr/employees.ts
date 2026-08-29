import {Tables} from "@/api/db/tables.ts";
import type {Employee} from "@/api/model/employee.ts";
import {buildEmployeeDossier, type EmployeeDossier} from "@/api/reports/hr/employee-dossier.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";

const EMPLOYEE_FETCH = "user, department, position, cost_center, manager";

const personName = (row: {first_name?: string; last_name?: string; login?: string} | null | undefined) => {
  if (!row) return undefined;
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return full || row.login || undefined;
};

const entityName = (row: {name?: string} | null | undefined) => row?.name ?? undefined;

export type EmployeeSummary = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  department?: string;
  position?: string;
  costCenter?: string;
  manager?: string;
  employmentStatus?: string;
  employmentType?: string;
  hireDate?: unknown;
  terminationDate?: unknown;
  linkedUserLogin?: string;
  linkedUserId?: string;
  notes?: string;
};

const summarizeEmployee = (row: Employee): EmployeeSummary => ({
  id: recordIdToString(row.id),
  employeeNumber: row.employee_number ?? "",
  firstName: row.first_name ?? "",
  lastName: row.last_name,
  fullName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
  department: entityName(row.department),
  position: entityName(row.position),
  costCenter: entityName(row.cost_center),
  manager: personName(row.manager),
  employmentStatus: row.employment_status,
  employmentType: row.employment_type,
  hireDate: row.hire_date,
  terminationDate: row.termination_date,
  linkedUserLogin: row.user?.login,
  linkedUserId: row.user?.id ? recordIdToString(row.user.id) : undefined,
  notes: row.notes,
});

const employeeNumberVariants = (value: string): string[] => {
  const trimmed = value.replace(/^#/, "").trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const withoutLeadingZeros = trimmed.replace(/^0+/, "") || "0";
  variants.add(withoutLeadingZeros);
  if (/^\d+$/.test(trimmed)) {
    variants.add(trimmed.padStart(5, "0"));
  }
  return Array.from(variants);
};

const buildEmployeeNumberConditions = (employeeNumber: string) => {
  const variants = employeeNumberVariants(employeeNumber);
  const params: Record<string, string> = {};
  const conditions = variants.map((variant, index) => {
    const key = `employeeNumber${index}`;
    params[key] = variant;
    return `employee_number = $${key}`;
  });
  return {condition: conditions.join(" OR "), params};
};

export const listEmployees = async (
  db: DbClient,
  options: {search?: string; limit?: number} = {},
): Promise<{count: number; employees: EmployeeSummary[]}> => {
  const limit = options.limit ?? 50;
  const search = options.search?.trim().toLowerCase();

  const query = `
    SELECT * FROM ${Tables.employees}
    WHERE deleted_at = NONE
    ORDER BY employee_number ASC, last_name ASC, first_name ASC
    LIMIT ${limit}
    FETCH ${EMPLOYEE_FETCH}
  `;
  const rows = unwrapQueryResult<Employee>(await db.query(query));

  const employees = rows
    .map(summarizeEmployee)
    .filter(employee => {
      if (!search) return true;
      return (
        employee.fullName.toLowerCase().includes(search)
        || employee.employeeNumber.toLowerCase().includes(search)
        || (employee.department?.toLowerCase().includes(search) ?? false)
        || (employee.position?.toLowerCase().includes(search) ?? false)
        || (employee.linkedUserLogin?.toLowerCase().includes(search) ?? false)
      );
    });

  return {count: employees.length, employees};
};

export type EmployeeDetailResult = {
  found: boolean;
  dossier?: EmployeeDossier;
};

const buildDetailResult = async (db: DbClient, row: Employee): Promise<EmployeeDetailResult> => ({
  found: true,
  dossier: await buildEmployeeDossier(db, row, summarizeEmployee(row)),
});

export const getEmployeeDetail = async (
  db: DbClient,
  options: {employeeNumber?: string; employeeId?: string},
): Promise<EmployeeDetailResult> => {
  const employeeId = options.employeeId?.trim();
  if (employeeId) {
    const query = `
      SELECT * FROM ${Tables.employees}
      WHERE id = $id AND deleted_at = NONE
      LIMIT 1
      FETCH ${EMPLOYEE_FETCH}
    `;
    const rows = unwrapQueryResult<Employee>(await db.query(query, {id: employeeId}));
    const row = rows[0];
    if (!row) {
      return {found: false};
    }
    return buildDetailResult(db, row);
  }

  const employeeNumber = options.employeeNumber?.trim();
  if (!employeeNumber) {
    return {found: false};
  }

  const {condition, params} = buildEmployeeNumberConditions(employeeNumber);
  const query = `
    SELECT * FROM ${Tables.employees}
    WHERE deleted_at = NONE AND (${condition})
    LIMIT 1
    FETCH ${EMPLOYEE_FETCH}
  `;
  const rows = unwrapQueryResult<Employee>(await db.query(query, params));
  const row = rows[0];
  if (!row) {
    return {found: false};
  }
  return buildDetailResult(db, row);
};
