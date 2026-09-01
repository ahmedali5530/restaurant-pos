import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export function createDepartmentImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "name",
      label: t("hr:columns.name", {defaultValue: "Name"}),
      type: "string",
      required: true,
      aliases: ["Name", "Department"],
    },
    {
      name: "code",
      label: t("hr:columns.code", {defaultValue: "Code"}),
      type: "string",
      optional: true,
      aliases: ["Code"],
    },
  ];

  return {
    id: "departments",
    entityLabel: t("hr:buttons.department", {defaultValue: "Department"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract HR department records with name and optional code. Do not invent values.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const payload: Record<string, unknown> = {name};
      const code = String(values.code ?? "").trim();
      if (code) payload.code = code;

      const rowData: Record<string, string> = {name};
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
          : await findCsvImportMatches(db, Tables.departments, conditions, {softDelete: false});

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.departments,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
