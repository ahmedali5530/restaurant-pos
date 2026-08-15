import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {resolveInventoryItem, type TFunc} from "@/lib/data-import/helpers.ts";

export type KitchenReconLine = {
  itemId: string;
  physicalCount: number | null;
  wasteQty: number;
  staffMealQty: number;
  complimentaryQty: number;
};

export function createKitchenReconImportConfig({
  db,
  t,
  collect,
}: {
  db: ImportDbLike;
  t: TFunc;
  collect: (line: KitchenReconLine) => void;
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

  return {
    id: "kitchen_reconciliation",
    entityLabel: t("inventory:kitchenReconciliation.title", {defaultValue: "Kitchen reconciliation"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract kitchen reconciliation rows with item code, optional name, physical count, waste, staff meal, and complimentary quantities.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const code = String(v.item_code ?? "").trim();
      if (!code) throw new Error(t("inventory:kitchenReconciliation.unknownItemCode", {code: ""}));

      const item = await resolveInventoryItem(db, code);
      if (!item?.id) {
        throw new Error(t("inventory:kitchenReconciliation.unknownItemCode", {code}));
      }

      const physicalRaw = v.physical_count;
      collect({
        itemId: String(item.id),
        physicalCount:
          physicalRaw === null || physicalRaw === undefined || String(physicalRaw).trim() === ""
            ? null
            : Number(physicalRaw),
        wasteQty: Number(v.waste) || 0,
        staffMealQty: Number(v.staff_meal) || 0,
        complimentaryQty: Number(v.complimentary) || 0,
      });
    },
  };
}
