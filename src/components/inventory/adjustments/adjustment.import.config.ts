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

export type AdjustmentLineAppend = (line: {
  item: SelectOption;
  quantity_change: number;
  unit_cost?: number | string;
  comments?: string;
}) => void;

export function createAdjustmentImportConfig({
  db,
  t,
  append,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: AdjustmentLineAppend;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "item",
      label: t("inventory:columns.item", {defaultValue: "Item"}),
      type: "string",
      required: true,
      aliases: ["Item", "Code", "SKU"],
    },
    {
      name: "quantity_change",
      label: t("inventory:forms.quantityChange", {defaultValue: "Quantity change"}),
      type: "number",
      required: true,
      aliases: ["Quantity change", "Qty change", "Quantity", "Qty"],
    },
    {
      name: "unit_cost",
      label: t("inventory:columns.unitCost", {defaultValue: "Unit cost"}),
      type: "number",
      optional: true,
      aliases: ["Unit cost", "Cost", "Price"],
    },
    {name: "comments", label: t("inventory:forms.comments"), type: "string", optional: true},
  ];

  return {
    id: "adjustment_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Adjustment line"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory adjustment lines with item code/name, quantity change (signed), optional unit cost, and comments.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      const unitCost =
        v.unit_cost === null || v.unit_cost === undefined || String(v.unit_cost).trim() === ""
          ? ""
          : Number(v.unit_cost);

      append({
        item: itemSelectOption(item),
        quantity_change: Number(v.quantity_change) || 0,
        unit_cost: unitCost,
        comments: v.comments ? String(v.comments) : undefined,
      });
    },
  };
}
