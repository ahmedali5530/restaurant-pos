import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches, writeCsvImportRow} from "@/utils/csv-import.ts";

export function createMenuImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true},
    {name: "priority", label: t("admin:columns.priority"), type: "number", defaultValue: 0},
  ];

  return {
    id: "menus",
    entityLabel: t("admin:buttons.menu", {defaultValue: "Menu"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract menu headers with name and optional display priority.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const name = String(record.values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));
      const payload = {name, priority: Number(record.values.priority ?? 0) || 0};
      const rowData = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "name", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.menus, conditions);
      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.menus,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
