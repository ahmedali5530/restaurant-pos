import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches, writeCsvImportRow} from "@/utils/csv-import.ts";
import {isOvernightShift} from "@/lib/shift.utils.ts";

export function createShiftImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true},
    {name: "start_time", label: t("admin:columns.startTime"), type: "string", required: true},
    {name: "end_time", label: t("admin:columns.endTime"), type: "string", required: true},
    {name: "ends_next_day", label: t("admin:columns.endsNextDay"), type: "boolean", optional: true},
  ];

  return {
    id: "shifts",
    entityLabel: t("admin:buttons.shift", {defaultValue: "Shift"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract shift name with start/end times (HH:mm). ends_next_day defaults from times when omitted.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const name = String(record.values.name ?? "").trim();
      const startTime = String(record.values.start_time ?? "").trim();
      const endTime = String(record.values.end_time ?? "").trim();
      if (!name || !startTime || !endTime) throw new Error(t("validation:required"));

      const endsNextDay = record.values.ends_next_day === undefined
        ? isOvernightShift(startTime, endTime)
        : parseImportBool(record.values.ends_next_day, false);

      const payload = {name, start_time: startTime, end_time: endTime, ends_next_day: endsNextDay};
      const rowData = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "name", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.shifts, conditions);
      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.shifts,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
