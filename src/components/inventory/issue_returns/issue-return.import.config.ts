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

export type IssueReturnLinePayload = {
  item: SelectOption;
  quantity: number;
  comments?: string;
};

export type IssueReturnLineAppend = (line: IssueReturnLinePayload) => void;

export function createIssueReturnImportConfig({
  db,
  t,
  append,
  update,
  getLines,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: IssueReturnLineAppend;
  update: (index: number, line: IssueReturnLinePayload) => void;
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
    {name: "quantity", label: t("inventory:forms.quantity"), type: "number", required: true},
    {name: "comments", label: t("inventory:forms.comments"), type: "string", optional: true},
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "issue_return_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Return line"}),
    shape: "records",
    fields,
    matchFields: ["item"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract issue return lines with item code/name, quantity, and optional comments.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      const payload: IssueReturnLinePayload = {
        item: itemSelectOption(item),
        quantity: Number(v.quantity) || 0,
        comments: v.comments ? String(v.comments) : undefined,
      };

      const matchIndexes = findMatchingLineIndexes(
        getLines(),
        ctx.matchFields,
        v,
        (line) => ({
          item: line.item?.value,
          quantity: line.quantity,
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
