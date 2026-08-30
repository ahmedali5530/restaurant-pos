import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {TFunc} from "@/lib/ai/tools/write-tools.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
} from "@/utils/csv-import.ts";
import {toRecordId} from "@/lib/utils.ts";

export type SoftDeleteImportConfigOptions = {
  db: ImportDbLike;
  t: TFunc;
  table: string;
  configId: string;
  entityLabel: string;
  matchFields: string[];
  matchFieldDescriptions?: Record<string, string>;
};

export function createSoftDeleteImportConfig(opts: SoftDeleteImportConfigOptions): ImportConfiguration {
  const {db, t, table, configId, entityLabel, matchFields, matchFieldDescriptions = {}} = opts;

  const fields: ImportField[] = matchFields.map(name => ({
    name,
    label: name,
    type: "string" as const,
    required: true,
    description: matchFieldDescriptions[name],
  }));

  return {
    id: configId,
    entityLabel,
    shape: "records",
    fields,
    matchFields,
    defaultMode: "update",
    db,
    extractionInstructions: `Soft-delete ${entityLabel} records matched by ${matchFields.join(", ")}.`,
    onImportRow: async (record: ImportRecord, ctx) => {
      const rowData: Record<string, string> = {};
      for (const field of matchFields) {
        rowData[field] = String(record.values[field] ?? "").trim();
      }
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field}),
      );

      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({
        column: _field,
        value,
      }));

      const existing = await findCsvImportMatches(db, table, conditions, {softDelete: true});
      if (existing.length === 0) {
        throw new Error(t("common:csvImport.recordNotFound"));
      }
      if (existing.length > 1) {
        throw new Error(t("common:csvImport.multipleMatches"));
      }

      await db.merge?.(toRecordId(existing[0].id), {deleted_at: new Date().toISOString()});
    },
  };
}
