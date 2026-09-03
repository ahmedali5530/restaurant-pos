import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {parseImportBool, requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export function createTableImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true, aliases: ["Name"]},
    {name: "number", label: t("admin:columns.number"), type: "string", required: true, aliases: ["Number", "No"]},
    {name: "ask_for_covers", label: t("admin:columns.askForCovers"), type: "boolean", defaultValue: false},
    {name: "background", label: t("admin:forms.backgroundColor"), type: "string", optional: true},
    {name: "color", label: t("admin:forms.fontColor"), type: "string", optional: true},
    {
      name: "floor",
      label: t("admin:columns.floor"),
      type: "reference",
      required: true,
      lookup: {table: Tables.floors, searchFields: ["name"], strategy: "case_insensitive"},
    },
    {name: "priority", label: t("admin:columns.priority"), type: "number", defaultValue: 0},
    {
      name: "categories",
      label: t("admin:columns.categories"),
      type: "reference[]",
      optional: true,
      lookup: {table: Tables.categories, searchFields: ["name"], strategy: "case_insensitive"},
    },
    {
      name: "order_types",
      label: t("admin:columns.orderTypes"),
      type: "reference[]",
      optional: true,
      lookup: {table: Tables.order_types, searchFields: ["name"], strategy: "case_insensitive"},
    },
    {
      name: "payment_types",
      label: t("admin:columns.paymentTypes"),
      type: "reference[]",
      optional: true,
      lookup: {table: Tables.payment_types, searchFields: ["name"], strategy: "case_insensitive"},
    },
  ];

  return {
    id: "tables",
    entityLabel: t("admin:buttons.table", {defaultValue: "Table"}),
    shape: "records",
    fields,
    matchFields: ["number"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract restaurant table records. Map table names, numbers, floor names, categories, order types, and payment types. Use pipe-separated lists for multi-values when unsure.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const v = record.values;
      const name = String(v.name ?? "").trim();
      const number = String(v.number ?? "").trim();
      if (!name || !number) throw new Error(t("validation:required"));

      const floorId = requireRefId(v.floor as ResolvedReference, "Floor not found");
      const categoryIds = ((v.categories as ResolvedReference[]) || [])
        .filter((r) => r.id)
        .map((r) => toRecordId(r.id));
      const orderTypeIds = ((v.order_types as ResolvedReference[]) || [])
        .filter((r) => r.id)
        .map((r) => toRecordId(r.id));
      const paymentTypeIds = ((v.payment_types as ResolvedReference[]) || [])
        .filter((r) => r.id)
        .map((r) => toRecordId(r.id));

      const payload: any = {
        name,
        number,
        ask_for_covers: parseImportBool(v.ask_for_covers),
        background: v.background ? String(v.background) : undefined,
        color: v.color ? String(v.color) : undefined,
        priority: Number(v.priority ?? 0) || 0,
        floor: floorId,
        categories: categoryIds,
        order_types: orderTypeIds,
        payment_types: paymentTypeIds,
      };

      const rowData: Record<string, string> = {
        name,
        number,
        ask_for_covers: String(payload.ask_for_covers),
        priority: String(payload.priority),
      };

      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const relationMatchFields = ["categories", "order_types", "payment_types", "floor"];
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (relationMatchFields.includes(field)) {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        if (field === "priority") return {column: "priority", value: Number(value)};
        if (field === "ask_for_covers") return {column: "ask_for_covers", value: parseImportBool(value)};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.tables, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.tables,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
