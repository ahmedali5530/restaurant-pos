import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {
  normalizeImportMatchValue,
  resolveInventoryItem,
  type TFunc,
} from "@/lib/data-import/helpers.ts";

export type KitchenReconLine = {
  itemId: string;
  physicalCount: number | null;
  wasteQty: number;
  staffMealQty: number;
  complimentaryQty: number;
};

export type KitchenReconExistingItem = {
  itemId: string;
  itemCode?: string;
};

export function createKitchenReconImportConfig({
  db,
  t,
  collect,
  getExistingItems,
}: {
  db: ImportDbLike;
  t: TFunc;
  collect: (line: KitchenReconLine) => void;
  getExistingItems: () => KitchenReconExistingItem[];
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "item_code",
      label: t("inventory:kitchenReconciliation.itemCode", {defaultValue: "Item Code"}),
      type: "string",
      required: true,
      aliases: ["Item code", "Code", "SKU"],
    },
    {
      name: "item_name",
      label: t("inventory:kitchenReconciliation.itemName", {defaultValue: "Item Name"}),
      type: "string",
      optional: true,
      aliases: ["Item name", "Name"],
    },
    {
      name: "physical_count",
      label: t("inventory:kitchenReconciliation.physicalCount", {defaultValue: "Physical Count"}),
      type: "number",
      optional: true,
    },
    {
      name: "waste",
      label: t("inventory:kitchenReconciliation.waste", {defaultValue: "Waste"}),
      type: "number",
      defaultValue: 0,
    },
    {
      name: "staff_meal",
      label: t("inventory:kitchenReconciliation.staffMeal", {defaultValue: "Staff Meal"}),
      type: "number",
      defaultValue: 0,
    },
    {
      name: "complimentary",
      label: t("inventory:kitchenReconciliation.complimentary", {defaultValue: "Complimentary"}),
      type: "number",
      defaultValue: 0,
    },
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "kitchen_reconciliation",
    entityLabel: t("inventory:kitchenReconciliation.title", {defaultValue: "Kitchen reconciliation"}),
    shape: "records",
    fields,
    matchFields: ["item_code"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract kitchen reconciliation rows with item code, optional name, physical count, waste, staff meal, and complimentary quantities.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const code = String(v.item_code ?? "").trim();
      if (!code) throw new Error(t("inventory:kitchenReconciliation.unknownItemCode", {code: ""}));

      const item = await resolveInventoryItem(db, code);
      if (!item?.id) {
        throw new Error(t("inventory:kitchenReconciliation.unknownItemCode", {code}));
      }

      const physicalRaw = v.physical_count;
      const line: KitchenReconLine = {
        itemId: String(item.id),
        physicalCount:
          physicalRaw === null || physicalRaw === undefined || String(physicalRaw).trim() === ""
            ? null
            : Number(physicalRaw),
        wasteQty: Number(v.waste) || 0,
        staffMealQty: Number(v.staff_meal) || 0,
        complimentaryQty: Number(v.complimentary) || 0,
      };

      const normalizedCode = normalizeImportMatchValue(code);
      const matchingItems = getExistingItems().filter((existing) => {
        const existingCode = normalizeImportMatchValue(existing.itemCode ?? "");
        const existingId = normalizeImportMatchValue(existing.itemId);
        return existingCode === normalizedCode || existingId === normalizeImportMatchValue(item.id);
      });

      if (matchingItems.length > 1) {
        throw new Error(multipleMatchesMessage);
      }

      const onSheet = matchingItems.length === 1;

      if (ctx.mode === "create" && onSheet) {
        throw new Error(t("inventory:kitchenReconciliation.itemAlreadyOnSheet", {
          defaultValue: "Item is already on the reconciliation sheet.",
        }));
      }

      if (ctx.mode === "update" && !onSheet) {
        throw new Error(notFoundMessage);
      }

      collect(line);
    },
  };
}
