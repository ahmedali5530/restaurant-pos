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

export type IssueReturnLineAppend = (line: {
  item: SelectOption;
  quantity: number;
  comments?: string;
}) => void;

export function createIssueReturnImportConfig({
  db,
  t,
  append,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: IssueReturnLineAppend;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "item",
      label: t("inventory:columns.item", {defaultValue: "Item"}),
      type: "string",
      required: true,
      aliases: ["Item", "Code", "SKU"],
    },
    {name: "quantity", label: t("inventory:forms.quantity"), type: "number", required: true},
    {name: "comments", label: t("inventory:forms.comments"), type: "string", optional: true},
  ];

  return {
    id: "issue_return_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Return line"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract issue return lines with item code/name, quantity, and optional comments.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      append({
        item: itemSelectOption(item),
        quantity: Number(v.quantity) || 0,
        comments: v.comments ? String(v.comments) : undefined,
      });
    },
  };
}
