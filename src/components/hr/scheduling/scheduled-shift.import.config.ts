import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  createScheduledShift,
  updateScheduledShift,
} from "@/lib/labor-engine/scheduling/schedule.service.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
} from "@/utils/csv-import.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import {
  parseImportDateTime,
  resolveByNameOrCode,
  resolveEmployee,
} from "@/components/hr/shared/import.utils.ts";

export function createScheduledShiftImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "employee",
      label: t("hr:forms.schedule.employee", {defaultValue: "Employee"}),
      type: "string",
      required: true,
      aliases: ["Employee", "Employee number", "Employee code", "Name"],
      description: "Employee number or full name",
    },
    {
      name: "schedule",
      label: t("hr:forms.schedule.workSchedule", {defaultValue: "Schedule"}),
      type: "string",
      required: true,
      aliases: ["Schedule", "Work schedule", "Schedule name"],
    },
    {
      name: "start_at",
      label: t("hr:forms.schedule.startAt", {defaultValue: "Start"}),
      type: "string",
      required: true,
      aliases: ["Start", "Start at", "Start datetime"],
    },
    {
      name: "end_at",
      label: t("hr:forms.schedule.endAt", {defaultValue: "End"}),
      type: "string",
      required: true,
      aliases: ["End", "End at", "End datetime"],
    },
    {
      name: "shift_template",
      label: t("hr:forms.schedule.shiftTemplate", {defaultValue: "Shift template"}),
      type: "string",
      optional: true,
      aliases: ["Template", "Shift template", "Shift"],
    },
    {
      name: "department",
      label: t("hr:forms.schedule.department", {defaultValue: "Department"}),
      type: "string",
      optional: true,
      aliases: ["Department"],
    },
    {
      name: "position",
      label: t("hr:forms.schedule.position", {defaultValue: "Position"}),
      type: "string",
      optional: true,
      aliases: ["Position"],
    },
    {
      name: "notes",
      label: t("hr:forms.schedule.notes", {defaultValue: "Notes"}),
      type: "string",
      optional: true,
      aliases: ["Notes", "Comment"],
    },
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "scheduled_shifts",
    entityLabel: t("hr:buttons.scheduledShift", {defaultValue: "Scheduled shift"}),
    shape: "records",
    fields,
    matchFields: ["employee", "start_at"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract scheduled shifts with employee (number or name), work schedule name, start/end datetimes, and optional template, department, position, notes.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const employeeKey = String(v.employee ?? "").trim();
      const scheduleKey = String(v.schedule ?? "").trim();
      if (!employeeKey) throw new Error("Employee is required");
      if (!scheduleKey) throw new Error("Schedule is required");

      const employee = await resolveEmployee(db, employeeKey);
      if (!employee) throw new Error(`Employee not found: ${employeeKey}`);

      const schedule = await resolveByNameOrCode(db, Tables.work_schedules, scheduleKey, ["name"]);
      if (!schedule) throw new Error(`Schedule not found: ${scheduleKey}`);

      const startAt = parseImportDateTime(v.start_at);
      const endAt = parseImportDateTime(v.end_at);
      if (endAt <= startAt) throw new Error("end_at must be after start_at");

      const templateKey = String(v.shift_template ?? "").trim();
      const departmentKey = String(v.department ?? "").trim();
      const positionKey = String(v.position ?? "").trim();

      const template = templateKey
        ? await resolveByNameOrCode(db, Tables.shifts, templateKey, ["name"])
        : null;
      if (templateKey && !template) throw new Error(`Shift template not found: ${templateKey}`);

      const department = departmentKey
        ? await resolveByNameOrCode(db, Tables.departments, departmentKey, ["name"])
        : null;
      if (departmentKey && !department) throw new Error(`Department not found: ${departmentKey}`);

      const position = positionKey
        ? await resolveByNameOrCode(db, Tables.positions, positionKey, ["name"])
        : null;
      if (positionKey && !position) throw new Error(`Position not found: ${positionKey}`);

      const shiftParams = {
        workScheduleId: String(schedule.id),
        employeeId: String(employee.id),
        startAt,
        endAt,
        shiftTemplateId: template ? String(template.id) : undefined,
        departmentId: department ? String(department.id) : undefined,
        positionId: position ? String(position.id) : undefined,
        notes: v.notes ? String(v.notes).trim() : undefined,
      };

      if (ctx.mode === "create") {
        const result = await createScheduledShift(db as any, shiftParams);
        if (!result.shift?.id) {
          const message = result.conflicts.map((c) => c.message).join("; ");
          throw new Error(message || t("hr:scheduling.conflictDescription", {defaultValue: "Shift conflict"}));
        }
        return;
      }

      const rowData: Record<string, string> = {
        employee: employeeKey,
        start_at: String(v.start_at ?? "").trim(),
      };
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "employee") {
          return {column: "employee", value: employee.id};
        }
        if (field === "start_at") {
          return {column: "start_at", value: toSurrealDateTime(parseImportDateTime(value))};
        }
        throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
      });

      const existing = await findCsvImportMatches(db, Tables.scheduled_shifts, conditions, {
        softDelete: false,
      });

      if (existing.length > 1) {
        throw new Error(multipleMatchesMessage);
      }

      if (existing.length === 1) {
        const result = await updateScheduledShift(db as any, {
          shiftId: String(existing[0].id),
          ...shiftParams,
        });
        if (!result.shift?.id) {
          const message = result.conflicts.map((c) => c.message).join("; ");
          throw new Error(message || t("hr:scheduling.conflictDescription", {defaultValue: "Shift conflict"}));
        }
        return;
      }

      if (ctx.mode === "update") {
        throw new Error(notFoundMessage);
      }

      const result = await createScheduledShift(db as any, shiftParams);
      if (!result.shift?.id) {
        const message = result.conflicts.map((c) => c.message).join("; ");
        throw new Error(message || t("hr:scheduling.conflictDescription", {defaultValue: "Shift conflict"}));
      }
    },
  };
}
