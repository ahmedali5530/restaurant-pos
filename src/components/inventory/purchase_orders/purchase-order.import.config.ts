import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {
  itemSelectOption,
  resolveInventoryItem,
  type SelectOption,
  type TFunc,
} from "@/lib/data-import/helpers.ts";

export type PurchaseOrderLineAppend = (line: {
  item: SelectOption;
  quantity: number;
  price: number;
  supplier: SelectOption | null;
}) => void;

export function createPurchaseOrderImportConfig({
  db,
  t,
  append,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: PurchaseOrderLineAppend;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "item",
      label: t("inventory:columns.item", {defaultValue: "Item"}),
      type: "string",
      required: true,
      aliases: ["Item", "Code", "SKU", "Item code"],
      description: "Inventory item code or name",
    },
    {name: "quantity", label: t("inventory:forms.quantity"), type: "number", required: true},
    {name: "price", label: t("inventory:columns.price"), type: "number", optional: true},
    {
      name: "supplier",
      label: t("inventory:columns.suppliers"),
      type: "string",
      optional: true,
      aliases: ["Supplier"],
    },
  ];

  return {
    id: "purchase_order_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "PO line"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract purchase order lines with item code/name, quantity, optional price and supplier name.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key, "suppliers");
      if (!item) throw new Error(`Item not found: ${key}`);

      let supplier: SelectOption | null = null;
      const supplierName = String(v.supplier ?? "").trim();
      if (supplierName) {
        const match = (item.suppliers ?? []).find((s: any) => s.name === supplierName);
        if (!match) throw new Error(`Supplier not found: ${supplierName}`);
        supplier = {label: match.name, value: String(match.id)};
      }

      append({
        item: itemSelectOption(item),
        quantity: Number(v.quantity) || 0,
        price: Number(v.price ?? item.price ?? 0) || 0,
        supplier,
      });
    },
  };
}
