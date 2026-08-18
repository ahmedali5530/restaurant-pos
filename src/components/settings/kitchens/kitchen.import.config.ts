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
import {ensureLocationForKitchen} from "@/lib/inventory/location.service.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
} from "@/utils/csv-import.ts";

function refIds(refs: ResolvedReference[] | undefined): any[] {
  return (refs ?? []).filter((ref) => ref.id).map((ref) => toRecordId(ref.id));
}

export function createKitchenImportConfig({
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
      aliases: ["Name", "Kitchen"],
    },
    {
      name: "priority",
      label: t("admin:columns.priority"),
      type: "number",
      defaultValue: 1,
      aliases: ["Priority", "Sort"],
    },
    {
      name: "items",
      label: t("admin:tabs.dishes", {defaultValue: "Dishes"}),
      type: "reference[]",
      optional: true,
      aliases: ["Dishes", "Items", "Menu items"],
      lookup: {
        table: Tables.dishes,
        searchFields: ["name", "number"],
        strategy: "case_insensitive",
      },
    },
    {
      name: "printers",
      label: t("admin:columns.printers"),
      type: "reference[]",
      optional: true,
      aliases: ["Printers"],
      lookup: {
        table: Tables.printers,
        searchFields: ["name"],
        strategy: "case_insensitive",
      },
    },
  ];

  return {
    id: "kitchens",
    entityLabel: t("admin:buttons.kitchen", {defaultValue: "Kitchen"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract kitchens with name, optional display order (priority), and optional pipe-separated dish names and printer names. Do not invent names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const payload: any = {
        name,
        priority: Number(values.priority ?? 1) || 1,
        items: refIds(values.items as ResolvedReference[]),
        printers: refIds(values.printers as ResolvedReference[]),
      };

      const rowData: Record<string, string> = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const relationMatchFields = ["items", "printers"];
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (relationMatchFields.includes(field)) {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        if (field === "priority") return {column: "priority", value: Number(value)};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.kitchens, conditions);

      if (existing.length > 1) {
        throw new Error(t("common:csvImport.multipleMatches"));
      }

      let kitchenId = "";
      if (ctx.mode !== "create" && existing.length === 1) {
        await db.merge?.(existing[0].id, payload);
        kitchenId = recordIdToString(existing[0].id) || String(existing[0].id);
      } else if (ctx.mode === "update") {
        throw new Error(t("common:csvImport.recordNotFound"));
      } else {
        const created = await db.create?.(Tables.kitchens, payload);
        const row = Array.isArray(created) ? created[0] : created;
        kitchenId = recordIdToString(row?.id) || String(row?.id ?? "");
      }

      if (kitchenId) {
        await ensureLocationForKitchen(db as any, kitchenId, {
          name,
          type: "Kitchen",
        });
      }
    },
  };
}
