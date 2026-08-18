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

export function createOrderTypeImportConfig({
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
      aliases: ["Name", "Order type"],
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort"],
    },
    {
      name: "allow_service_charges",
      label: t("admin:columns.serviceCharges"),
      type: "boolean",
      defaultValue: false,
      aliases: ["Allow service charges", "Service charges"],
    },
  ];

  return {
    id: "order_types",
    entityLabel: t("admin:buttons.orderType", {defaultValue: "Order type"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract order types with name, optional display order (priority), and whether service charges are allowed. Do not invent names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const payload: any = {
        name,
        priority: Number(values.priority ?? 0) || 0,
        allow_service_charges: parseImportBool(values.allow_service_charges),
      };

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "priority") return {column: "priority", value: Number(value)};
        if (field === "allow_service_charges") {
          return {column: "allow_service_charges", value: parseImportBool(value)};
        }
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.order_types, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.order_types,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
