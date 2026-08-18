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

export function createFloorImportConfig({
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
      aliases: ["Name", "Floor"],
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort"],
    },
    {
      name: "background",
      label: t("admin:forms.backgroundColor"),
      type: "string",
      optional: true,
      aliases: ["Background", "Background color"],
    },
    {
      name: "color",
      label: t("admin:forms.fontColor"),
      type: "string",
      optional: true,
      aliases: ["Color", "Font color"],
    },
  ];

  return {
    id: "floors",
    entityLabel: t("admin:buttons.floor", {defaultValue: "Floor"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract restaurant floors with name, optional display order (priority), and optional background/font colors. Do not invent names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const payload: any = {
        name,
        priority: Number(values.priority ?? 0) || 0,
      };
      const background = String(values.background ?? "").trim();
      const color = String(values.color ?? "").trim();
      if (background) payload.background = background;
      if (color) payload.color = color;

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "priority") return {column: "priority", value: Number(value)};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.floors, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.floors,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
