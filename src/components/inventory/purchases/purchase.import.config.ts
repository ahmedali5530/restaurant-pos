import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {
  applyListImportMode,
  findMatchingLineIndexes,
  itemSelectOption,
  normalizeImportMatchValue,
  resolveInventoryItem,
  resolveItemFormLineMatchValue,
  resolveItemFormMatchValue,
  toSelectOption,
  type SelectOption,
  type TFunc,
} from "@/lib/data-import/helpers.ts";
import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {resolveReferences} from "@/lib/data-import/resolve-refs.ts";
import {dateToCalendarDate} from "@/utils/date.ts";

const CATALOG_PROMPT_LIMIT = 80;

async function loadNameCatalog(
  database: ImportDbLike,
  table: string
): Promise<string[]> {
  const [rows] = await database.query(`SELECT name FROM ${table}`);
  return (rows ?? [])
    .map((r: any) => String(r.name ?? "").trim())
    .filter(Boolean);
}

function formatCatalogLine(label: string, names: string[]): string {
  if (names.length === 0) return "";
  const shown = names.slice(0, CATALOG_PROMPT_LIMIT);
  const suffix =
    names.length > CATALOG_PROMPT_LIMIT
      ? ` (and ${names.length - CATALOG_PROMPT_LIMIT} more)`
      : "";
  return `${label}: ${shown.join(", ")}${suffix}`;
}

async function autofillCodesFromItemName(
  database: ImportDbLike,
  records: ImportRecord[],
  t: TFunc,
  signal?: AbortSignal
): Promise<void> {
  for (const record of records) {
    throwIfAborted(signal);
    const code = String(record.values.code ?? "").trim();
    if (code) continue;
    const name = String(record.values.name ?? "").trim();
    if (!name) continue;

    const [matches] = await database.query(
      `SELECT code, name FROM ${Tables.inventory_items}
       WHERE deleted_at = none AND string::lowercase(name) = string::lowercase($name)
       LIMIT 5`,
      {name}
    );
    if (!matches?.length) continue;
    if (matches.length > 1) continue;

    const matchedCode = String(matches[0].code ?? "").trim();
    if (!matchedCode) continue;

    record.values.code = matchedCode;
    record.issues = record.issues.filter(
      (i) => !(i.field === "code" && (i.code === "required" || i.code === "auto_corrected"))
    );
    record.issues.push({
      field: "code",
      code: "auto_corrected",
      severity: "warning",
      message: t("inventory:import.codeAutoFilled", {
        code: matchedCode,
        name,
        defaultValue: `Filled code "${matchedCode}" from existing item "${name}"`,
      }),
    });
  }
}

export type PurchaseLinePayload = {
  item: SelectOption;
  quantity: number;
  requested: number;
  price: number;
  base_quantity: number;
  expiry_date: any;
  manufacturing_date: any;
  comments?: string;
  supplier: SelectOption;
  code: string;
  location: SelectOption;
  taxable: boolean;
};

export type PurchaseLineAppend = (line: PurchaseLinePayload) => void;

export function createPurchaseImportConfig({
  db,
  t,
  append,
  update,
  getLines,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: PurchaseLineAppend;
  update: (index: number, line: PurchaseLinePayload) => void;
  getLines: () => any[];
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("inventory:itemName"), type: "string", required: true, aliases: ["Item name", "Name"]},
    {name: "code", label: t("inventory:itemCode"), type: "string", required: true, aliases: ["Item code", "Code", "SKU"]},
    {name: "base_quantity", label: t("inventory:columns.baseQuantity"), type: "number", defaultValue: 1, optional: true},
    {name: "quantity", label: t("inventory:forms.quantity"), type: "number", required: true},
    {name: "requested", label: t("inventory:forms.requested"), type: "number", optional: true},
    {name: "price", label: t("inventory:columns.price"), type: "number", required: true},
    {name: "expiry_date", label: t("inventory:forms.expiryDate"), type: "date", optional: true},
    {name: "manufacturing_date", label: t("inventory:forms.manufacturingDate"), type: "date", optional: true},
    {
      name: "supplier",
      label: t("inventory:columns.suppliers"),
      type: "reference",
      required: true,
      aliases: ["Supplier"],
      lookup: {
        table: Tables.inventory_suppliers,
        searchFields: ["name"],
        strategy: "fuzzy",
        softDelete: false,
      },
    },
    {
      name: "location",
      label: t("inventory:columns.location"),
      type: "reference",
      required: true,
      aliases: ["Location"],
      lookup: {
        table: Tables.inventory_locations,
        searchFields: ["name"],
        strategy: "fuzzy",
        softDelete: false,
      },
    },
    {name: "comments", label: t("inventory:forms.comments"), type: "string", optional: true},
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "purchase_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Purchase line"}),
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions: [
      "Extract purchase line items with item name, optional code, quantities, price, supplier name, location name, and optional dates/comments.",
      "Prefer exact supplier and location names from the Known values list when the document text is a close or extended variant.",
      "Do not invent item codes; leave code empty when unknown so the system can fill it from an existing item name match.",
    ].join(" "),
    enrichExtractionContext: async (database) => {
      const [suppliers, locations] = await Promise.all([
        loadNameCatalog(database, Tables.inventory_suppliers),
        loadNameCatalog(database, Tables.inventory_locations),
      ]);
      const lines = [
        formatCatalogLine("Known suppliers", suppliers),
        formatCatalogLine("Known locations", locations),
      ].filter(Boolean);
      if (lines.length === 0) return "";
      return ["Known values (prefer these exact labels when matching):", ...lines].join("\n");
    },
    onResolveReferences: async (config, records, options) => {
      await resolveReferences(config, records, options);
      await autofillCodesFromItemName(db, records, t, options?.signal);
    },
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const name = String(v.name ?? "").trim();
      const code = String(v.code ?? "").trim();
      if (!name && !code) {
        throw new Error(t("inventory:import.itemNameOrCodeRequired", {
          defaultValue: "Item name or code is required",
        }));
      }

      const lookupKey = code || name;
      const item = await resolveInventoryItem(db, lookupKey, "suppliers, locations");
      if (!item) {
        throw new Error(
          t("inventory:import.itemNotFound", {
            key: lookupKey,
            defaultValue: `Item not found: ${lookupKey}`,
          })
        );
      }

      const supplierOpt = toSelectOption(v.supplier as ResolvedReference);
      if (!supplierOpt) {
        throw new Error(t("inventory:import.supplierRequired", {defaultValue: "Supplier is required"}));
      }
      const supplier = (item.suppliers ?? []).find(
        (s: any) => String(s.id) === String(supplierOpt.value)
      );
      if (!supplier) {
        throw new Error(
          t("inventory:import.supplierNotOnItem", {
            supplier: supplierOpt.label,
            item: item.name ?? lookupKey,
            defaultValue: `Supplier "${supplierOpt.label}" is not linked to item "${item.name ?? lookupKey}"`,
          })
        );
      }

      const locationOpt = toSelectOption(v.location as ResolvedReference);
      if (!locationOpt) {
        throw new Error(t("inventory:import.locationRequired", {defaultValue: "Location is required"}));
      }
      const location = (item.locations ?? []).find(
        (loc: any) => String(loc.id) === String(locationOpt.value)
      );
      if (!location) {
        throw new Error(
          t("inventory:import.locationNotOnItem", {
            location: locationOpt.label,
            item: item.name ?? lookupKey,
            defaultValue: `Location "${locationOpt.label}" is not linked to item "${item.name ?? lookupKey}"`,
          })
        );
      }

      const expiryRaw = v.expiry_date ? String(v.expiry_date) : "";
      const mfgRaw = v.manufacturing_date ? String(v.manufacturing_date) : "";
      const itemCode = String(item.code ?? code).trim();

      const payload: PurchaseLinePayload = {
        item: itemSelectOption(item),
        quantity: Number(v.quantity) || 0,
        requested: Number(v.requested ?? v.quantity) || 0,
        price: Number(v.price) || 0,
        base_quantity: 1,
        expiry_date: expiryRaw ? dateToCalendarDate(expiryRaw) : null,
        manufacturing_date: mfgRaw ? dateToCalendarDate(mfgRaw) : null,
        comments: v.comments ? String(v.comments) : undefined,
        supplier: {label: supplier.name, value: String(supplier.id)},
        code: itemCode,
        location: {label: location.name, value: String(location.id)},
        taxable: !!item.taxable,
      };

      const matchIndexes = findMatchingLineIndexes(
        getLines(),
        ctx.matchFields,
        v,
        (line) => ({
          code: line.item?.value,
          name: line.item?.value,
          item: line.item?.value,
          supplier: line.supplier?.value,
          location: line.location?.value,
          quantity: line.quantity,
          price: line.price,
        }),
        {
          skipLine: (line) => !line?.item?.value,
          resolveImportField: (field, value) => {
            if (field === "supplier" || field === "location") {
              return normalizeImportMatchValue((value as ResolvedReference)?.id ?? value);
            }
            return resolveItemFormMatchValue(field, value, item);
          },
          resolveLineField: (field, _value, line) => {
            if (field === "supplier") {
              return normalizeImportMatchValue(line.supplier?.value);
            }
            if (field === "location") {
              return normalizeImportMatchValue(line.location?.value);
            }
            return resolveItemFormLineMatchValue(field, line);
          },
        }
      );

      applyListImportMode({
        mode: ctx.mode,
        existingIndexes: matchIndexes,
        append,
        update: (index) => update(index, payload),
        payload,
        notFoundMessage,
        multipleMatchesMessage,
      });
    },
  };
}
