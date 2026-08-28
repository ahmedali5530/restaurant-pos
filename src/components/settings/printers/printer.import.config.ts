import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches, writeCsvImportRow} from "@/utils/csv-import.ts";

export function createPrinterImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true},
    {name: "priority", label: t("admin:columns.priority"), type: "number", defaultValue: 0},
    {name: "type", label: t("admin:columns.type"), type: "string", optional: true},
    {name: "ip_address", label: t("admin:columns.ipAddress"), type: "string", optional: true},
    {name: "port", label: t("admin:columns.port"), type: "number", optional: true},
    {name: "vid", label: t("admin:columns.vid"), type: "string", optional: true},
    {name: "pid", label: t("admin:columns.pid"), type: "string", optional: true},
    {name: "path", label: t("admin:columns.path"), type: "string", optional: true},
  ];

  return {
    id: "printers",
    entityLabel: t("admin:buttons.printer", {defaultValue: "Printer"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract printer name, connection type, IP/port or USB identifiers.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const name = String(record.values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));
      const payload: Record<string, unknown> = {
        name,
        priority: Number(record.values.priority ?? 0) || 0,
        type: record.values.type ? String(record.values.type) : null,
        ip_address: record.values.ip_address ? String(record.values.ip_address) : null,
        port: record.values.port === undefined || record.values.port === null ? null : Number(record.values.port),
        vid: record.values.vid ? String(record.values.vid) : null,
        pid: record.values.pid ? String(record.values.pid) : null,
        path: record.values.path ? String(record.values.path) : null,
      };
      const rowData = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "name", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.printers, conditions);
      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.printers,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
