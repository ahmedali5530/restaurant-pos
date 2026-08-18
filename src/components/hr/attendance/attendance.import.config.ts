import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {Tables} from "@/api/db/tables.ts";
import type {User} from "@/api/model/user.ts";
import {
  createManualEntry,
  updateImportedEntry,
} from "@/lib/labor-engine/attendance/attendance.service.ts";
import {toEntityRecordId} from "@/lib/labor-engine/record-id.ts";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import {parseImportDateTime, resolveEmployee} from "@/components/hr/shared/import.utils.ts";
import {assertCsvMatchValues} from "@/utils/csv-import.ts";

export function createAttendanceImportConfig({
  db,
  t,
  user,
}: {
  db: ImportDbLike;
  t: TFunc;
  user?: User | null;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "employee",
      label: t("hr:columns.employee", {defaultValue: "Employee"}),
      type: "string",
      required: true,
      aliases: ["Employee", "Employee number", "Employee code", "Name"],
      description: "Employee number or full name",
    },
    {
      name: "clock_in",
      label: t("hr:columns.clockIn", {defaultValue: "Clock in"}),
      type: "string",
      required: true,
      aliases: ["Clock in", "Clock-in", "Start", "In"],
    },
    {
      name: "clock_out",
      label: t("hr:columns.clockOut", {defaultValue: "Clock out"}),
      type: "string",
      required: true,
      aliases: ["Clock out", "Clock-out", "End", "Out"],
    },
    {
      name: "notes",
      label: t("hr:columns.notes", {defaultValue: "Notes"}),
      type: "string",
      optional: true,
      aliases: ["Notes", "Comment"],
    },
  ];

  return {
    id: "time_entries",
    entityLabel: t("hr:tabs.attendance", {defaultValue: "Attendance"}),
    shape: "records",
    fields,
    matchFields: ["employee", "clock_in"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract attendance punches with employee (number or name), clock-in datetime, clock-out datetime, and optional notes. Clock-out must be after clock-in. Do not invent employees.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      if (!user?.id) {
        throw new Error(t("hr:messages.requiredFields", {defaultValue: "Required fields are missing"}));
      }

      const values = record.values;
      const employeeKey = String(values.employee ?? "").trim();
      if (!employeeKey) throw new Error(t("validation:required"));

      const clockIn = parseImportDateTime(values.clock_in);
      const clockOut = parseImportDateTime(values.clock_out);
      if (clockOut <= clockIn) {
        throw new Error(t("hr:attendance.clockOutAfterClockIn", {defaultValue: "Clock out must be after clock in"}));
      }

      const employee = await resolveEmployee(db, employeeKey);
      if (!employee) throw new Error(`Employee not found: ${employeeKey}`);

      const notes = String(values.notes ?? "").trim() || undefined;
      const rowData: Record<string, string> = {
        employee: employeeKey,
        clock_in: String(values.clock_in ?? "").trim(),
      };
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const clockInAt = toSurrealDateTime(clockIn);
      const [matches] =
        ctx.mode === "create"
          ? [[]]
          : await db.query(
              `SELECT id FROM ${Tables.time_entries}
               WHERE employee = $employee AND clock_in = $clockIn LIMIT 2`,
              {
                employee: toEntityRecordId(String(employee.id)),
                clockIn: clockInAt,
              }
            );

      const existing = (matches as Array<{id: any}>) ?? [];
      if (existing.length > 1) {
        throw new Error(t("common:csvImport.multipleMatches"));
      }

      if (ctx.mode === "create" || existing.length === 0) {
        if (ctx.mode === "update") {
          throw new Error(t("common:csvImport.recordNotFound"));
        }
        await createManualEntry(db as any, {
          user,
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
        user,
      });
    },
  };
}
