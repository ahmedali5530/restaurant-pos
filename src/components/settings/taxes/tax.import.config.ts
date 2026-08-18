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

export function createTaxImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "name",
      label: t("admin:columns.name"),
      type: "string",
      required: true,
      aliases: ["Name", "Tax"],
    },
    {
      name: "rate",
      label: t("admin:columns.ratePercent"),
      type: "number",
      required: true,
      aliases: ["Rate", "Percent", "Rate %"],
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort"],
    },
  ];

  return {
    id: "taxes",
    entityLabel: t("admin:buttons.tax", {defaultValue: "Tax"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract tax records with name, numeric rate percent, and optional display order (priority). Do not invent names or rates.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const rate = Number(values.rate);
      if (!Number.isFinite(rate)) throw new Error(t("validation:mustBeNumber"));

      const payload: any = {
        name,
        rate,
        priority: Number(values.priority ?? 0) || 0,
      };

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "priority" || field === "rate") return {column: field, value: Number(value)};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.taxes, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.taxes,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
