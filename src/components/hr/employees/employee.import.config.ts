import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";

const EMPLOYMENT_STATUSES = ["active", "inactive", "terminated", "on_leave", "suspended"] as const;
const EMPLOYMENT_TYPES = [
  "hourly",
  "monthly_salary",
  "weekly_salary",
  "daily_wage",
  "contract",
  "commission",
  "mixed",
] as const;

export function createEmployeeImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "employee_number",
      label: t("hr:columns.employeeNumber", {defaultValue: "Employee number"}),
      type: "string",
      required: true,
      aliases: ["Employee number", "Number", "Code"],
    },
    {
      name: "first_name",
      label: t("hr:columns.firstName", {defaultValue: "First name"}),
      type: "string",
      required: true,
      aliases: ["First name", "First"],
    },
    {
      name: "last_name",
      label: t("hr:columns.lastName", {defaultValue: "Last name"}),
      type: "string",
      optional: true,
      aliases: ["Last name", "Last"],
    },
    {
      name: "department",
      label: t("hr:columns.department", {defaultValue: "Department"}),
      type: "reference",
      optional: true,
      lookup: {table: Tables.departments, searchFields: ["name"], strategy: "case_insensitive"},
    },
    {
      name: "position",
      label: t("hr:columns.position", {defaultValue: "Position"}),
      type: "reference",
      optional: true,
      lookup: {table: Tables.positions, searchFields: ["name"], strategy: "case_insensitive"},
    },
    {
      name: "employment_status",
      label: t("hr:columns.status", {defaultValue: "Status"}),
      type: "string",
      defaultValue: "active",
      aliases: ["Status", "Employment status"],
      description: EMPLOYMENT_STATUSES.join(", "),
    },
    {
      name: "employment_type",
      label: t("hr:columns.employmentType", {defaultValue: "Employment type"}),
      type: "string",
      defaultValue: "hourly",
      aliases: ["Employment type", "Type"],
      description: EMPLOYMENT_TYPES.join(", "),
    },
    {
      name: "hire_date",
      label: t("hr:columns.hireDate", {defaultValue: "Hire date"}),
      type: "string",
      optional: true,
      aliases: ["Hire date"],
    },
    {
      name: "notes",
      label: t("hr:columns.notes", {defaultValue: "Notes"}),
      type: "string",
      optional: true,
      aliases: ["Notes"],
    },
  ];

  return {
    id: "employees",
    entityLabel: t("hr:buttons.employee", {defaultValue: "Employee"}),
    shape: "records",
    fields,
    matchFields: ["employee_number"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract employee records with employee number, first/last name, optional department and position names, employment status/type, hire date, and notes.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const v = record.values;
      const employeeNumber = String(v.employee_number ?? "").trim();
      const firstName = String(v.first_name ?? "").trim();
      if (!employeeNumber || !firstName) throw new Error(t("validation:required"));

      const status = String(v.employment_status ?? "active").trim().toLowerCase();
      if (!EMPLOYMENT_STATUSES.includes(status as any)) {
        throw new Error(`Invalid employment status: ${v.employment_status}`);
      }

      const empType = String(v.employment_type ?? "hourly").trim().toLowerCase();
      if (!EMPLOYMENT_TYPES.includes(empType as any)) {
        throw new Error(`Invalid employment type: ${v.employment_type}`);
      }

      const payload: Record<string, unknown> = {
        employee_number: employeeNumber,
        first_name: firstName,
        last_name: String(v.last_name ?? "").trim() || undefined,
        employment_status: status,
        employment_type: empType,
        notes: v.notes ? String(v.notes).trim() : undefined,
      };

      const departmentRef = v.department as ResolvedReference | undefined;
      if (departmentRef?.id) payload.department = toRecordId(departmentRef.id);

      const positionRef = v.position as ResolvedReference | undefined;
      if (positionRef?.id) payload.position = toRecordId(positionRef.id);

      const hireDateRaw = String(v.hire_date ?? "").trim();
      if (hireDateRaw) {
        const d = new Date(hireDateRaw);
        if (Number.isNaN(d.getTime())) throw new Error(`Invalid hire date: ${hireDateRaw}`);
        payload.hire_date = toSurrealDateTime(d);
      }

      const rowData: Record<string, string> = {employee_number: employeeNumber};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => ({
        column: field,
        value,
      }));

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.employees, conditions, {softDelete: false});

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.employees,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
