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
import {convertEnteredQtyToStock} from "@/lib/inventory/unit.convert.ts";
import {normalizeUom} from "@/utils/inventoryUom.ts";

export type KitchenReconLine = {
  itemId: string;
  physicalCount: number | null;
  wasteQty: number;
  staffMealQty: number;
  complimentaryQty: number;
  enteredUom?: string | null;
  enteredPhysicalCount?: number | null;
  enteredWasteQty?: number | null;
  enteredStaffMealQty?: number | null;
  enteredComplimentaryQty?: number | null;
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
    {
      name: "entered_uom",
      label: t("inventory:forms.uom", {defaultValue: "UOM"}),
      type: "string",
      optional: true,
      aliases: ["UOM", "Unit", "Count UOM"],
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
      "Extract kitchen reconciliation rows with item code, optional name, physical count, waste, staff meal, complimentary quantities, and optional count UOM (convertible family of the item stock unit).",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const code = String(v.item_code ?? "").trim();
      if (!code) throw new Error(t("inventory:kitchenReconciliation.unknownItemCode", {code: ""}));

      const item = await resolveInventoryItem(db, code);
      if (!item?.id) {
        throw new Error(t("inventory:kitchenReconciliation.unknownItemCode", {code}));
      }

      const stockUom = normalizeUom(item.uom) ?? item.uom ?? "";
      const enteredUomRaw = String(v.entered_uom ?? "").trim();
      const enteredUom = enteredUomRaw
        ? normalizeUom(enteredUomRaw) ?? enteredUomRaw
        : stockUom;

      const physicalRaw = v.physical_count;
      const enteredPhysical =
        physicalRaw === null || physicalRaw === undefined || String(physicalRaw).trim() === ""
          ? null
          : Number(physicalRaw);
      const enteredWaste = Number(v.waste) || 0;
      const enteredStaff = Number(v.staff_meal) || 0;
      const enteredComplimentary = Number(v.complimentary) || 0;

      const line: KitchenReconLine = {
        itemId: String(item.id),
        physicalCount: convertEnteredQtyToStock(enteredPhysical, enteredUom, stockUom),
        wasteQty: convertEnteredQtyToStock(enteredWaste, enteredUom, stockUom) ?? 0,
        staffMealQty: convertEnteredQtyToStock(enteredStaff, enteredUom, stockUom) ?? 0,
        complimentaryQty:
          convertEnteredQtyToStock(enteredComplimentary, enteredUom, stockUom) ?? 0,
        enteredUom: enteredUom || null,
        enteredPhysicalCount: enteredPhysical,
        enteredWasteQty: enteredWaste,
        enteredStaffMealQty: enteredStaff,
        enteredComplimentaryQty: enteredComplimentary,
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
