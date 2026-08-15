import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export function createCategoryImportConfig({
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
      aliases: ["Name", "Category"],
    },
    {
      name: "show_in_menu",
      label: t("admin:columns.showInMenu"),
      type: "boolean",
      defaultValue: true,
      aliases: ["Show in menu", "ShowInMenu"],
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
    id: "categories",
    entityLabel: t("admin:buttons.category", {defaultValue: "Category"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract menu categories. Map names to name, display order to priority, and whether shown on the menu to show_in_menu. Do not invent values.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const payload: any = {
        name,
        show_in_menu: parseImportBool(values.show_in_menu),
        priority: Number(values.priority ?? 0) || 0,
      };

      const rowData: Record<string, string> = {
        name,
        show_in_menu: String(payload.show_in_menu),
        priority: String(payload.priority),
      };

      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "priority") return {column: "priority", value: Number(value)};
        if (field === "show_in_menu") return {column: "show_in_menu", value: parseImportBool(value)};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.categories, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.categories,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
