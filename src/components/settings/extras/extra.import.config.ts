import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

function refIds(refs: ResolvedReference[] | undefined): any[] {
  return (refs ?? []).filter((ref) => ref.id).map((ref) => toRecordId(ref.id));
}

export function createExtraImportConfig({
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
      aliases: ["Name", "Extra"],
    },
    {
      name: "value",
      label: t("admin:columns.value"),
      type: "number",
      required: true,
      aliases: ["Value", "Amount"],
    },
    {
      name: "apply_to_all",
      label: t("admin:columns.applyToAll"),
      type: "boolean",
      defaultValue: false,
      aliases: ["Apply to all"],
    },
    {
      name: "delivery",
      label: t("admin:columns.delivery"),
      type: "boolean",
      defaultValue: false,
      aliases: ["Delivery"],
    },
    {
      name: "payment_types",
      label: t("admin:columns.paymentTypes"),
      type: "reference[]",
      optional: true,
      aliases: ["Payment types"],
      lookup: {
        table: Tables.payment_types,
        searchFields: ["name"],
        strategy: "case_insensitive",
      },
    },
    {
      name: "order_types",
      label: t("admin:columns.orderTypes"),
      type: "reference[]",
      optional: true,
      aliases: ["Order types"],
      lookup: {
        table: Tables.order_types,
        searchFields: ["name"],
        strategy: "case_insensitive",
      },
    },
    {
      name: "tables",
      label: t("admin:columns.tables"),
      type: "reference[]",
      optional: true,
      aliases: ["Tables"],
      lookup: {
        table: Tables.tables,
        searchFields: ["name", "number"],
        strategy: "case_insensitive",
      },
    },
  ];

  return {
    id: "extras",
    entityLabel: t("admin:buttons.extra", {defaultValue: "Extra"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract extras (service charges) with name, numeric value, apply_to_all, delivery, and optional pipe-separated payment types, order types, and tables. Do not invent names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const value = Number(values.value);
      if (!Number.isFinite(value)) throw new Error(t("validation:mustBeNumber"));

      const payload: any = {
        name,
        value,
        apply_to_all: parseImportBool(values.apply_to_all),
        delivery: parseImportBool(values.delivery),
        payment_types: refIds(values.payment_types as ResolvedReference[]),
        order_types: refIds(values.order_types as ResolvedReference[]),
        tables: refIds(values.tables as ResolvedReference[]),
      };

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const relationMatchFields = ["payment_types", "order_types", "tables"];
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (relationMatchFields.includes(field)) {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        if (field === "value") return {column: "value", value: Number(value)};
        if (field === "apply_to_all" || field === "delivery") {
          return {column: field, value: parseImportBool(value)};
        }
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.extras, conditions, {softDelete: false});

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.extras,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
