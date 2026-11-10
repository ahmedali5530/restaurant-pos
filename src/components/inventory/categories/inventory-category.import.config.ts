import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {
  optionalIdField,
  resolveUpdateMatchesByIdOrLegacy,
} from "@/lib/data-import/match-by-id.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export function createInventoryCategoryImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    optionalIdField(t),
    {
      name: "name",
      label: t("inventory:columns.name"),
      type: "string",
      required: true,
      aliases: ["Name", "Category"],
    },
    {
      name: "priority",
      label: t("inventory:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort"],
    },
  ];

  return {
    id: "inventory_categories",
    entityLabel: t("inventory:tabs.categories", {defaultValue: "Category"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory item categories with name and optional display order (priority). Do not invent names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const payload: any = {
        name,
        priority: Number(values.priority ?? 0) || 0,
      };

      const rowData: Record<string, string> = {
        name,
        priority: String(payload.priority),
      };

      const idRaw = String(values.id ?? "").trim();
      if (!idRaw) {
        assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
          t("common:csvImport.emptyMatchValue", {field})
        );
      }

      const existing = await resolveUpdateMatchesByIdOrLegacy(db, Tables.inventory_categories, {
        mode: ctx.mode,
        id: idRaw,
        softDelete: false,
        legacy: async () => {
          const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
            if (field === "priority") return {column: "priority", value: Number(value)};
            return {column: field, value};
          });
          return findCsvImportMatches(db, Tables.inventory_categories, conditions, {
            softDelete: false,
          });
        },
      });

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.inventory_categories,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
