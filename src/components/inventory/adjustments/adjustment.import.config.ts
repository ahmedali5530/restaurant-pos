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
  resolveInventoryItem,
  resolveItemFormLineMatchValue,
  resolveItemFormMatchValue,
  type SelectOption,
  type TFunc,
} from "@/lib/data-import/helpers.ts";

export type AdjustmentLinePayload = {
  item: SelectOption;
  quantity_change: number;
  unit_cost?: number | string;
  comments?: string;
};

export type AdjustmentLineAppend = (line: AdjustmentLinePayload) => void;

export function createAdjustmentImportConfig({
  db,
  t,
  append,
  update,
  getLines,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: AdjustmentLineAppend;
  update: (index: number, line: AdjustmentLinePayload) => void;
  getLines: () => any[];
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

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "adjustment_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Adjustment line"}),
    shape: "records",
    fields,
    matchFields: ["item"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory adjustment lines with item code/name, quantity change (signed), optional unit cost, and comments.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      const unitCost =
        v.unit_cost === null || v.unit_cost === undefined || String(v.unit_cost).trim() === ""
          ? ""
          : Number(v.unit_cost);

      const payload: AdjustmentLinePayload = {
        item: itemSelectOption(item),
        quantity_change: Number(v.quantity_change) || 0,
        unit_cost: unitCost,
        comments: v.comments ? String(v.comments) : undefined,
      };

      const matchIndexes = findMatchingLineIndexes(
        getLines(),
        ctx.matchFields,
        v,
        (line) => ({
          item: line.item?.value,
          quantity_change: line.quantity_change,
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
