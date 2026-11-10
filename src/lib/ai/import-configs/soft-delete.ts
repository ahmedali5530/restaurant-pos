import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {TFunc} from "@/lib/ai/tools/write-tools.ts";
import {optionalIdField, requireUniqueMatchByIdOrKeys} from "@/lib/data-import/match-by-id.ts";
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

  const fields: ImportField[] = [
    optionalIdField(t),
    ...matchFields.map(name => ({
      name,
      label: name,
      type: "string" as const,
      optional: true,
      description: matchFieldDescriptions[name],
    })),
  ];

  return {
    id: configId,
    entityLabel,
    shape: "records",
    fields,
    matchFields,
    defaultMode: "update",
    db,
    extractionInstructions:
      `Soft-delete ${entityLabel} records matched by id (preferred) or ${matchFields.join(", ")}.`,
    onImportRow: async (record: ImportRecord) => {
      const idRaw = String(record.values.id ?? "").trim();
      const keys: Record<string, unknown> = {};
      for (const field of matchFields) {
        const value = String(record.values[field] ?? "").trim();
        if (value) keys[field] = value;
      }

      if (!idRaw && matchFields.every((field) => !keys[field])) {
        throw new Error(
          t("common:csvImport.emptyMatchValue", {
            field: "id or " + matchFields.join("/"),
          }),
        );
      }

      const matched = await requireUniqueMatchByIdOrKeys(db, table, {
        id: idRaw || undefined,
        keys,
        softDelete: true,
        t,
        keyLabel: matchFields[0],
      });

      await db.merge?.(toRecordId(matched.id), {deleted_at: new Date().toISOString()});
    },
  };
}
