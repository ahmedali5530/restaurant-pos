import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {
  itemSelectOption,
  resolveInventoryItem,
  toSelectOption,
  type SelectOption,
  type TFunc,
} from "@/lib/data-import/helpers.ts";
import {Tables} from "@/api/db/tables.ts";

export type IssueLineAppend = (line: {
  location: SelectOption | null;
  item: SelectOption;
  requested: number;
  quantity: number;
  comments?: string;
}) => void;

export function createIssueImportConfig({
  db,
  t,
  append,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: IssueLineAppend;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "location",
      label: t("inventory:columns.location"),
      type: "reference",
      optional: true,
      lookup: {
        table: Tables.inventory_locations,
        searchFields: ["name"],
        strategy: "case_insensitive",
        softDelete: false,
      },
    },
    {
      name: "item",
      label: t("inventory:columns.item", {defaultValue: "Item"}),
      type: "string",
      required: true,
      aliases: ["Item", "Code", "SKU"],
    },
    {name: "requested", label: t("inventory:forms.requested"), type: "number", optional: true},
    {name: "quantity", label: t("inventory:forms.quantity"), type: "number", required: true},
    {name: "comments", label: t("inventory:forms.comments"), type: "string", optional: true},
  ];

  return {
    id: "issue_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Issue line"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory issue lines with optional source location, item code/name, requested qty, issued qty, and comments.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      const qty = Number(v.quantity) || 0;
      append({
        location: toSelectOption(v.location as ResolvedReference),
        item: itemSelectOption(item),
        requested: Number(v.requested ?? qty) || 0,
        quantity: qty,
        comments: v.comments ? String(v.comments) : undefined,
      });
    },
  };
}
