import {Tables} from "@/api/db/tables.ts";
import {
  INVENTORY_LOCATION_TYPES,
  type InventoryLocationType,
} from "@/api/model/inventory_location.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
import {
  createLocation,
  updateLocation,
} from "@/lib/inventory/location.service.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
} from "@/utils/csv-import.ts";

function parseLocationType(raw: any): InventoryLocationType {
  const value = String(raw ?? "").trim();
  if (!value) return "Store";
  const match = INVENTORY_LOCATION_TYPES.find(
    (type) => type.toLowerCase() === value.toLowerCase()
  );
  if (!match) {
    throw new Error(`Invalid location type: ${value}`);
  }
  return match;
}

export function createLocationImportConfig({
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
      aliases: ["Name", "Location"],
    },
    {
      name: "type",
      label: t("inventory:columns.locationType"),
      type: "string",
      required: true,
      defaultValue: "Store",
      aliases: ["Type", "Location type"],
      description: INVENTORY_LOCATION_TYPES.join(", "),
    },
    {
      name: "is_active",
      label: t("inventory:columns.active"),
      type: "boolean",
      defaultValue: true,
      aliases: ["Active", "Is active"],
    },
  ];

  return {
    id: "inventory_locations",
    entityLabel: t("inventory:tabs.locations", {defaultValue: "Location"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions:
      `Extract inventory locations with name, type (${INVENTORY_LOCATION_TYPES.join(", ")}), and optional active flag. Default type is Store. Do not invent names or linked store/kitchen ids.`,
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));

      const type = parseLocationType(values.type);
      const is_active = parseImportBool(values.is_active);

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
          : await findCsvImportMatches(db, Tables.inventory_locations, conditions, {
              softDelete: false,
            });

      if (existing.length > 1) {
        throw new Error(t("common:csvImport.multipleMatches"));
      }

      if (ctx.mode === "create" || existing.length === 0) {
        if (ctx.mode === "update") {
          throw new Error(t("common:csvImport.recordNotFound"));
        }
        await createLocation(db as any, {name, type, is_active});
        return;
      }

      await updateLocation(db as any, String(existing[0].id), {name, type, is_active});
    },
  };
}
