import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {Tables} from "@/api/db/tables.ts";
import {createScheduledShift} from "@/lib/labor-engine/scheduling/schedule.service.ts";

async function resolveByNameOrCode(
  db: ImportDbLike,
  table: string,
  key: string,
  fields: string[] = ["name"]
): Promise<any | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;

  for (const field of fields) {
    const [rows] = await db.query(
      `SELECT id, ${fields.join(", ")} FROM ${table} WHERE ${field} = $key LIMIT 1`,
      {key: trimmed}
    );
    if (rows?.length) return rows[0];
  }

  // case-insensitive name fallback
  if (fields.includes("name")) {
    const [rows] = await db.query(
      `SELECT id, name FROM ${table} WHERE string::lowercase(name) = string::lowercase($key) LIMIT 1`,
      {key: trimmed}
    );
    if (rows?.length) return rows[0];
  }
  return null;
}

function parseDateTime(value: any): Date {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Date/time is required");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${raw}`);
  return d;
}

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

  return {
    id: "scheduled_shifts",
    entityLabel: t("hr:buttons.scheduledShift", {defaultValue: "Scheduled shift"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract scheduled shifts with employee (number or name), work schedule name, start/end datetimes, and optional template, department, position, notes.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const employeeKey = String(v.employee ?? "").trim();
      const scheduleKey = String(v.schedule ?? "").trim();
      if (!employeeKey) throw new Error("Employee is required");
      if (!scheduleKey) throw new Error("Schedule is required");

      const [byNumber] = await db.query(
        `SELECT id, employee_number, first_name, last_name FROM ${Tables.employees}
         WHERE employee_number = $key LIMIT 1`,
        {key: employeeKey}
      );
      let employee = byNumber?.[0];
      if (!employee) {
        const [byName] = await db.query(
          `SELECT id, employee_number, first_name, last_name FROM ${Tables.employees}
           WHERE string::lowercase(string::concat(first_name, ' ', last_name ?? '')) = string::lowercase($key)
           OR string::lowercase(first_name) = string::lowercase($key)
           LIMIT 1`,
          {key: employeeKey}
        );
        employee = byName?.[0];
      }
      if (!employee) throw new Error(`Employee not found: ${employeeKey}`);

      const schedule = await resolveByNameOrCode(db, Tables.work_schedules, scheduleKey, ["name"]);
      if (!schedule) throw new Error(`Schedule not found: ${scheduleKey}`);

      const startAt = parseDateTime(v.start_at);
      const endAt = parseDateTime(v.end_at);
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

      const result = await createScheduledShift(db as any, {
        workScheduleId: String(schedule.id),
        employeeId: String(employee.id),
        startAt,
        endAt,
        shiftTemplateId: template ? String(template.id) : undefined,
        departmentId: department ? String(department.id) : undefined,
        positionId: position ? String(position.id) : undefined,
        notes: v.notes ? String(v.notes).trim() : undefined,
      });

      if (!result.shift?.id) {
        const message = result.conflicts.map((c) => c.message).join("; ");
        throw new Error(message || t("hr:scheduling.conflictDescription", {defaultValue: "Shift conflict"}));
      }
    },
  };
}
