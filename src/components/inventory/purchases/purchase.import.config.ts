import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {
  applyListImportMode,
  findMatchingLineIndexes,
  itemSelectOption,
  resolveItemFormLineMatchValue,
  resolveItemFormMatchValue,
  type SelectOption,
  type TFunc,
} from "@/lib/data-import/helpers.ts";
import {dateToCalendarDate} from "@/utils/date.ts";

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
    {name: "base_quantity", label: t("inventory:columns.baseQuantity"), type: "number", defaultValue: 1},
    {name: "quantity", label: t("inventory:forms.quantity"), type: "number", required: true},
    {name: "requested", label: t("inventory:forms.requested"), type: "number", optional: true},
    {name: "price", label: t("inventory:columns.price"), type: "number", required: true},
    {name: "expiry_date", label: t("inventory:forms.expiryDate"), type: "date", optional: true},
    {name: "manufacturing_date", label: t("inventory:forms.manufacturingDate"), type: "date", optional: true},
    {name: "supplier", label: t("inventory:columns.suppliers"), type: "string", required: true},
    {name: "location", label: t("inventory:columns.location"), type: "string", required: true},
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
    extractionInstructions:
      "Extract purchase line items with item name, code, quantities, price, supplier name, location name, and optional dates/comments.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const name = String(v.name ?? "").trim();
      const code = String(v.code ?? "").trim();
      if (!name || !code) throw new Error("Item name and code are required");

      const [items] = await db.query(
        `SELECT * FROM ${Tables.inventory_items} WHERE name = $name AND code = $code FETCH suppliers, locations`,
        {name, code}
      );
      if (!items?.length) throw new Error("Item not found");
      const item = items[0];

      const supplierName = String(v.supplier ?? "").trim();
      const supplier = (item.suppliers ?? []).find((s: any) => s.name === supplierName);
      if (!supplier) throw new Error("Supplier not found");

      const locationName = String(v.location ?? "").trim();
      const location = (item.locations ?? []).find((loc: any) => loc.name === locationName);
      if (!location) throw new Error("Location not found");

      const expiryRaw = v.expiry_date ? String(v.expiry_date) : "";
      const mfgRaw = v.manufacturing_date ? String(v.manufacturing_date) : "";

      const payload: PurchaseLinePayload = {
        item: itemSelectOption(item),
        quantity: Number(v.quantity) || 0,
        requested: Number(v.requested ?? v.quantity) || 0,
        price: Number(v.price) || 0,
        base_quantity: Number(v.base_quantity ?? 1) || 1,
        expiry_date: expiryRaw ? dateToCalendarDate(expiryRaw) : null,
        manufacturing_date: mfgRaw ? dateToCalendarDate(mfgRaw) : null,
        comments: v.comments ? String(v.comments) : undefined,
        supplier: {label: supplier.name, value: String(supplier.id)},
        code: "",
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
          resolveImportField: (field, value) => resolveItemFormMatchValue(field, value, item),
          resolveLineField: (field, _value, line) => resolveItemFormLineMatchValue(field, line),
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
