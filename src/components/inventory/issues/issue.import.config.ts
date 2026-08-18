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
import {Tables} from "@/api/db/tables.ts";

export type IssueLinePayload = {
  location: SelectOption | null;
  item: SelectOption;
  requested: number;
  quantity: number;
  comments?: string;
  price?: number;
};

export type IssueLineAppend = (line: IssueLinePayload) => void;

export function createIssueImportConfig({
  db,
  t,
  append,
  update,
  getLines,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: IssueLineAppend;
  update: (index: number, line: IssueLinePayload) => void;
  getLines: () => any[];
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

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "issue_lines",
    entityLabel: t("inventory:tabs.items", {defaultValue: "Issue line"}),
    shape: "records",
    fields,
    matchFields: ["item"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract inventory issue lines with optional source location, item code/name, requested qty, issued qty, and comments.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const key = String(v.item ?? "").trim();
      const item = await resolveInventoryItem(db, key);
      if (!item) throw new Error(`Item not found: ${key}`);

      const qty = Number(v.quantity) || 0;
      const payload: IssueLinePayload = {
        location: toSelectOption(v.location as ResolvedReference),
        item: itemSelectOption(item),
        requested: Number(v.requested ?? qty) || 0,
        quantity: qty,
        comments: v.comments ? String(v.comments) : undefined,
        price: 0,
      };

      const matchIndexes = findMatchingLineIndexes(
        getLines(),
        ctx.matchFields,
        v,
        (line) => ({
          item: line.item?.value,
          location: line.location?.value,
          quantity: line.quantity,
        }),
        {
          skipLine: (line) => !line?.item?.value,
          resolveImportField: (field, value) => {
            if (field === "location") {
              return normalizeImportMatchValue((value as ResolvedReference)?.id ?? value);
            }
            return resolveItemFormMatchValue(field, value, item);
          },
          resolveLineField: (field, _value, line) => {
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
