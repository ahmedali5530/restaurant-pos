import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {TFunc, WriteToolContext} from "@/lib/ai/tools/write-tools.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {toRecordId} from "@/lib/utils.ts";
import {resolveEmployee} from "@/components/hr/shared/import.utils.ts";
import {createRequest} from "@/lib/labor-engine/leave/leave.service.ts";
import {createManualEntry, updateImportedEntry} from "@/lib/labor-engine/attendance/attendance.service.ts";
import {parseImportDateTime} from "@/components/hr/shared/import.utils.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import {toEntityRecordId} from "@/lib/labor-engine/record-id.ts";

async function resolveDepartmentId(db: ImportDbLike, name: string) {
  const [rows] = await db.query(
    `SELECT id FROM ${Tables.departments} WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none LIMIT 1`,
    {name},
  );
  return rows?.[0]?.id;
}

async function resolveCostCenterId(db: ImportDbLike, name: string) {
  const [rows] = await db.query(
    `SELECT id FROM ${Tables.cost_centers} WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none LIMIT 1`,
    {name},
  );
  return rows?.[0]?.id;
}

async function resolveLeaveTypeId(db: ImportDbLike, name: string) {
  const [rows] = await db.query(
    `SELECT id FROM ${Tables.leave_types} WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none LIMIT 1`,
    {name},
  );
  return rows?.[0]?.id;
}

export function createPositionImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "code", type: "string", required: true},
    {name: "name", type: "string", required: true},
    {name: "department", type: "string", description: "Department name"},
    {name: "default_cost_center", type: "string", description: "Cost center name"},
    {name: "is_active", type: "boolean"},
  ];

  return {
    id: "positions",
    entityLabel: t("hr:tabs.positions", {defaultValue: "Position"}),
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract HR positions with code, name, optional department and cost center.",
    onImportRow: async (record, ctx) => {
      const v = record.values;
      const code = String(v.code ?? "").trim();
      const name = String(v.name ?? "").trim();
      if (!code || !name) throw new Error(t("validation:required"));

      const payload: Record<string, unknown> = {
        code,
        name,
        is_active: v.is_active !== false,
      };
      if (v.department) {
        const deptId = await resolveDepartmentId(db, String(v.department));
        if (!deptId) throw new Error(`Department not found: ${v.department}`);
        payload.department = toRecordId(deptId);
      }
      if (v.default_cost_center) {
        const ccId = await resolveCostCenterId(db, String(v.default_cost_center));
        if (!ccId) throw new Error(`Cost center not found: ${v.default_cost_center}`);
        payload.default_cost_center = toRecordId(ccId);
      }

      const rowData = {code};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_f, value) => ({column: "code", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.positions, conditions, {softDelete: false});

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.positions,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}

export function createCostCenterImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "code", type: "string", required: true},
    {name: "name", type: "string", required: true},
    {name: "is_active", type: "boolean"},
  ];

  return {
    id: "cost_centers",
    entityLabel: t("hr:tabs.costCenters", {defaultValue: "Cost center"}),
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract cost centers with code and name.",
    onImportRow: async (record, ctx) => {
      const code = String(record.values.code ?? "").trim();
      const name = String(record.values.name ?? "").trim();
      if (!code || !name) throw new Error(t("validation:required"));

      const payload = {code, name, is_active: record.values.is_active !== false};
      const rowData = {code};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_f, value) => ({column: "code", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.cost_centers, conditions, {softDelete: false});

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.cost_centers,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}

export function createLeaveRequestImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "employee", type: "string", required: true, description: "Employee number or name"},
    {name: "leave_type", type: "string", required: true},
    {name: "start_date", type: "string", required: true},
    {name: "end_date", type: "string", required: true},
    {name: "days", type: "number"},
    {name: "reason", type: "string"},
  ];

  return {
    id: "leave_requests",
    entityLabel: t("hr:tabs.leave", {defaultValue: "Leave request"}),
    shape: "records",
    fields,
    matchFields: [],
    defaultMode: "create",
    db,
    extractionInstructions: "Create HR leave requests with employee, leave type, and date range.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const employee = await resolveEmployee(db, String(v.employee ?? "").trim());
      if (!employee) throw new Error(`Employee not found: ${v.employee}`);

      const leaveTypeId = await resolveLeaveTypeId(db, String(v.leave_type ?? "").trim());
      if (!leaveTypeId) throw new Error(`Leave type not found: ${v.leave_type}`);

      await createRequest(db as any, {
        employeeId: String(employee.id),
        leaveTypeId: String(leaveTypeId),
        startDate: String(v.start_date),
        endDate: String(v.end_date),
        days: v.days != null ? Number(v.days) : 0,
        reason: v.reason ? String(v.reason) : undefined,
        createdBy: context.user as any,
      });
    },
  };
}

export function createAiAttendanceImportConfig({
  db,
  t,
  context = {},
}: {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "employee", type: "string", required: true},
    {name: "clock_in", type: "string", required: true},
    {name: "clock_out", type: "string", required: true},
    {name: "notes", type: "string"},
  ];

  return {
    id: "time_entries",
    entityLabel: t("hr:tabs.attendance", {defaultValue: "Attendance"}),
    shape: "records",
    fields,
    matchFields: ["employee", "clock_in"],
    defaultMode: "create",
    db,
    extractionInstructions: "Record attendance with employee, clock-in, and clock-out datetimes.",
    onImportRow: async (record, ctx) => {
      if (!context.user) {
        throw new Error(t("hr:messages.requiredFields", {defaultValue: "User context required for attendance"}));
      }

      const values = record.values;
      const employeeKey = String(values.employee ?? "").trim();
      const clockIn = parseImportDateTime(values.clock_in);
      const clockOut = parseImportDateTime(values.clock_out);
      if (!employeeKey || !clockIn || !clockOut || clockOut <= clockIn) {
        throw new Error("Invalid attendance row");
      }

      const employee = await resolveEmployee(db, employeeKey);
      if (!employee) throw new Error(`Employee not found: ${employeeKey}`);

      const notes = values.notes ? String(values.notes) : undefined;
      const clockInAt = toSurrealDateTime(clockIn);

      const [matches] = ctx.mode === "create"
        ? [[]]
        : await db.query(
            `SELECT id FROM ${Tables.time_entries} WHERE employee = $employee AND clock_in = $clockIn LIMIT 2`,
            {employee: toEntityRecordId(String(employee.id)), clockIn: clockInAt},
          );
      const existing = (matches as Array<{id: unknown}>) ?? [];

      if (ctx.mode === "create" || existing.length === 0) {
        if (ctx.mode === "update") throw new Error(t("common:csvImport.recordNotFound"));
        await createManualEntry(db as any, {
          user: context.user as any,
          employeeId: String(employee.id),
          clockIn,
          clockOut,
          notes,
          source: "import",
        });
        return;
      }

      await updateImportedEntry(db as any, {
        timeEntryId: String(existing[0].id),
        clockIn,
        clockOut,
        notes,
        user: context.user as any,
      });
    },
  };
}
