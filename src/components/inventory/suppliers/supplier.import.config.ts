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

export function createSupplierImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "name",
      label: t("inventory:columns.name"),
      type: "string",
      required: true,
      aliases: ["Name", "Supplier"],
    },
    {
      name: "address",
      label: t("inventory:columns.address"),
      type: "string",
      optional: true,
      aliases: ["Address"],
    },
    {
      name: "phone",
      label: t("inventory:columns.phone"),
      type: "string",
      optional: true,
      aliases: ["Phone", "Phone number"],
    },
    {
      name: "email",
      label: t("inventory:columns.email"),
      type: "string",
      optional: true,
      aliases: ["Email"],
    },
  ];

  return {
    id: "inventory_suppliers",
    entityLabel: t("inventory:tabs.suppliers", {defaultValue: "Supplier"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory suppliers with name and optional address, phone, and email. Do not invent names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const address = String(values.address ?? "").trim();
      const phone = String(values.phone ?? "").trim();
      const email = String(values.email ?? "").trim();

      const payload: any = {name};
      if (address) payload.address = address;
      if (phone) payload.phone = phone;
      if (email) payload.email = email;

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.inventory_suppliers, conditions, {
              softDelete: false,
            });

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.inventory_suppliers,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
