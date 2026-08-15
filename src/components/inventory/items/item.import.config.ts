import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {requireRefId, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export function createInventoryItemImportConfig({
  db,
  t,
}: {
  db: ImportDbLike;
  t: TFunc;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("inventory:columns.name"), type: "string", required: true, aliases: ["Name"]},
    {name: "code", label: t("inventory:columns.code"), type: "string", required: true, aliases: ["Code", "SKU"]},
    {
      name: "category",
      label: t("inventory:columns.category"),
      type: "reference",
      required: true,
      lookup: {
        table: Tables.inventory_categories,
        searchFields: ["name"],
        strategy: "case_insensitive",
        softDelete: false,
      },
    },
    {name: "uom", label: t("inventory:columns.uom"), type: "string", required: true, aliases: ["UOM", "Unit"]},
    {name: "base_quantity", label: t("inventory:columns.baseQuantity"), type: "number", defaultValue: 1},
    {name: "price", label: t("inventory:columns.price"), type: "number", defaultValue: 0},
    {name: "average_price", label: t("inventory:columns.avgPrice"), type: "number", defaultValue: 0, optional: true},
    {
      name: "locations",
      label: t("inventory:tabs.locations"),
      type: "reference[]",
      required: true,
      lookup: {
        table: Tables.inventory_locations,
        searchFields: ["name"],
        strategy: "case_insensitive",
        softDelete: false,
      },
    },
    {
      name: "suppliers",
      label: t("inventory:tabs.suppliers"),
      type: "reference[]",
      required: true,
      lookup: {
        table: Tables.inventory_suppliers,
        searchFields: ["name"],
        strategy: "case_insensitive",
        softDelete: false,
      },
    },
    {
      name: "item_types",
      label: t("inventory:itemType.label"),
      type: "string",
      optional: true,
      aliases: ["Item types", "Types"],
    },
    {
      name: "reorder_levels",
      label: t("inventory:columns.reorderLevels"),
      type: "string",
      optional: true,
      aliases: ["Reorder levels"],
      description: "Comma-separated location:level pairs",
    },
  ];

  return {
    id: "inventory_items",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Item"}),
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory items with name, code, category, UOM, quantities, prices, locations, and suppliers. Do not invent codes.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const v = record.values;
      const name = String(v.name ?? "").trim();
      const code = String(v.code ?? "").trim();
      if (!name || !code) throw new Error(t("validation:required"));

      const categoryId = requireRefId(
        v.category as ResolvedReference,
        `Invalid category`
      );
      const locationRefs = (v.locations as ResolvedReference[]) || [];
      const supplierRefs = (v.suppliers as ResolvedReference[]) || [];
      if (locationRefs.length === 0) throw new Error("Locations are required");
      if (supplierRefs.length === 0) throw new Error("Suppliers are required");

      const locations = locationRefs.map((r) => {
        if (!r.id) throw new Error(`Invalid location "${r.label}"`);
        return {id: String(r.id), name: r.label};
      });
      const suppliers = supplierRefs.map((r) => {
        if (!r.id) throw new Error(`Invalid supplier "${r.label}"`);
        return toRecordId(r.id);
      });

      const reorderLevels: Record<string, number> = {};
      const reorderRaw = String(v.reorder_levels ?? "").trim();
      if (reorderRaw) {
        for (const entry of reorderRaw.split(",")) {
          const [locationName, levelStr] = entry.split(":").map((p) => p.trim());
          if (!locationName || !levelStr) {
            throw new Error(`Invalid reorder level entry "${entry.trim()}"`);
          }
          const location = locations.find((item) => item.name === locationName);
          if (!location) {
            throw new Error(`Invalid location in reorder levels "${locationName}"`);
          }
          const level = Number(levelStr);
          if (!Number.isFinite(level) || level <= 0) {
            throw new Error(`Invalid reorder level for "${locationName}"`);
          }
          reorderLevels[location.id] = level;
        }
      }

      const itemTypesRaw = String(v.item_types ?? "").trim();
      const item_types = itemTypesRaw
        ? itemTypesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      const payload: any = {
        name,
        code,
        uom: String(v.uom ?? "").trim(),
        category: categoryId,
        base_quantity: Number(v.base_quantity ?? 1) || 1,
        suppliers,
        locations: locations.map((l) => toRecordId(l.id)),
        price: Number(v.price ?? 0) || 0,
        average_price: Number(v.average_price ?? 0) || 0,
        reorder_levels: reorderLevels,
      };
      if (item_types?.length) payload.item_types = item_types;

      const rowData: Record<string, string> = {name, code};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const unsupported = ["category", "locations", "suppliers", "item_types", "reorder_levels"];
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (unsupported.includes(field)) {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        if (field === "base_quantity" || field === "price" || field === "average_price") {
          return {column: field, value: Number(value)};
        }
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.inventory_items, conditions, {
              softDelete: false,
            });

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.inventory_items,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
