import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

const PAYMENT_TYPE_KINDS = ["Cash", "Card", "Points", "Remote"] as const;

function parsePaymentKind(raw: any): (typeof PAYMENT_TYPE_KINDS)[number] {
  const value = String(raw ?? "").trim();
  const match = PAYMENT_TYPE_KINDS.find((kind) => kind.toLowerCase() === value.toLowerCase());
  if (!match) {
    throw new Error(`Invalid payment type: ${value || "(empty)"}`);
  }
  return match;
}

export function createPaymentTypeImportConfig({
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
      aliases: ["Name", "Payment type"],
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 0,
      aliases: ["Priority", "Sort"],
    },
    {
      name: "type",
      label: t("admin:columns.type"),
      type: "string",
      required: true,
      aliases: ["Type", "Kind"],
      description: PAYMENT_TYPE_KINDS.join(", "),
    },
    {
      name: "tax",
      label: t("admin:columns.tax"),
      type: "reference",
      optional: true,
      aliases: ["Tax"],
      lookup: {
        table: Tables.taxes,
        searchFields: ["name"],
        strategy: "case_insensitive",
      },
    },
  ];

  return {
    id: "payment_types",
    entityLabel: t("admin:buttons.paymentType", {defaultValue: "Payment type"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      `Extract payment types with name, type (${PAYMENT_TYPE_KINDS.join(", ")}), optional tax name, and optional display order. Do not extract gateway keys or secrets.`,
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const type = parsePaymentKind(values.type);
      const taxRef = values.tax as ResolvedReference | undefined;

      const payload: any = {
        name,
        type,
        priority: Number(values.priority ?? 0) || 0,
        has_discount: false,
        discounts: null,
      };
      if (taxRef?.id) {
        payload.tax = toRecordId(taxRef.id);
      }

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (field === "tax") {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        if (field === "priority") return {column: "priority", value: Number(value)};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.payment_types, conditions);

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.payment_types,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
