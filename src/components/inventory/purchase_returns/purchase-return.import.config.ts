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

export type PurchaseReturnLineAppend = (line: {
  item: SelectOption;
  quantity: number;
  comments?: string;
  purchase_item_id?: string | null;
}) => void;

export function createPurchaseReturnImportConfig({
  db,
  t,
  append,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: PurchaseReturnLineAppend;
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
    {name: "comments", label: t("inventory:forms.comments"), type: "string", optional: true},
  ];

  return {
    id: "purchase_return_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Purchase return line"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract purchase return lines with item code/name, quantity, and optional comments.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      append({
        item: itemSelectOption(item),
        quantity: Number(v.quantity) || 0,
        comments: v.comments ? String(v.comments) : undefined,
        purchase_item_id: null,
      });
    },
  };
}
