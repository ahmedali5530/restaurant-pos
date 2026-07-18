import type {
  InventoryPurchaseExtra,
  PurchaseAllocationMethod,
  PurchaseCostCategory,
  PurchaseInventoryTreatment,
} from "@/api/model/inventory_purchase.ts";
import { buildTypedExtra, normalizePurchaseExtra } from "@/lib/inventory/purchase-cost/normalize.ts";
import { safeNumber } from "@/lib/utils.ts";

export type AdvancedExtraFormValue = {
  name: string;
  amount: number | string;
  category?: { label: string; value: string } | null;
  allocation_method?: { label: string; value: string } | null;
  inventory_treatment?: { label: string; value: string } | null;
};

export type SplitPurchaseExtras = {
  discount: number;
  shipping: number;
  advanced: AdvancedExtraFormValue[];
};

const isSimpleShipping = (extra: InventoryPurchaseExtra) => {
  const n = normalizePurchaseExtra(extra);
  return n?.category === "Shipping" && (extra.name === "Shipping" || !extra.category || n.name === "Shipping");
};

const isSimpleDiscount = (extra: InventoryPurchaseExtra) => {
  const n = normalizePurchaseExtra(extra);
  return n?.category === "Discount";
};

/** Pull dedicated Discount/Shipping UI fields out of stored extras. */
export const splitPurchaseExtrasForForm = (
  extras: InventoryPurchaseExtra[] | null | undefined,
  labels: {
    category: (c: string) => string;
    allocation: (m: string) => string;
    treatment: (t: string) => string;
  }
): SplitPurchaseExtras => {
  let discount = 0;
  let shipping = 0;
  const advanced: AdvancedExtraFormValue[] = [];
  let shippingTaken = false;
  let discountTaken = false;

  for (const extra of extras ?? []) {
    if (!discountTaken && isSimpleDiscount(extra)) {
      discount = Math.abs(safeNumber(extra.amount));
      discountTaken = true;
      continue;
    }
    if (!shippingTaken && isSimpleShipping(extra)) {
      shipping = Math.abs(safeNumber(extra.amount));
      shippingTaken = true;
      continue;
    }
    const n = normalizePurchaseExtra(extra);
    if (!n) continue;
    // Skip Tax extras that mirror header tax
    if (n.category === "Tax" && n.name === "Purchase Tax") continue;

    advanced.push({
      name: n.name,
      amount: Math.abs(n.amount),
      category: {
        label: labels.category(n.category),
        value: n.category,
      },
      allocation_method: {
        label: labels.allocation(n.allocation_method),
        value: n.allocation_method,
      },
      inventory_treatment: {
        label: labels.treatment(n.inventory_treatment),
        value: n.inventory_treatment,
      },
    });
  }

  return { discount, shipping, advanced };
};

/** Merge simple UI fields + advanced rows into typed extras for persistence. */
export const mergePurchaseExtrasForSave = (params: {
  discount?: number | string | null;
  shipping?: number | string | null;
  advanced?: AdvancedExtraFormValue[] | null;
  defaultAllocationMethod?: PurchaseAllocationMethod;
}): InventoryPurchaseExtra[] => {
  const result: InventoryPurchaseExtra[] = [];
  const discount = safeNumber(params.discount);
  const shipping = safeNumber(params.shipping);
  const method = params.defaultAllocationMethod ?? "by_value";

  if (discount > 0) {
    result.push(
      buildTypedExtra({
        name: "Discount",
        amount: -discount,
        category: "Discount",
        allocation_method: method,
        inventory_treatment: "capitalize",
      })
    );
  }

  if (shipping > 0) {
    result.push(
      buildTypedExtra({
        name: "Shipping",
        amount: shipping,
        category: "Shipping",
        allocation_method: method,
        inventory_treatment: "capitalize",
      })
    );
  }

  for (const row of params.advanced ?? []) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const category = (row.category?.value || "Miscellaneous") as PurchaseCostCategory;
    const amountRaw = safeNumber(row.amount);
    const amount = category === "Discount" ? -Math.abs(amountRaw) : amountRaw;
    result.push(
      buildTypedExtra({
        name,
        amount,
        category,
        allocation_method: (row.allocation_method?.value as PurchaseAllocationMethod) ?? method,
        inventory_treatment: row.inventory_treatment?.value as PurchaseInventoryTreatment | undefined,
      })
    );
  }

  return result;
};

/** Invoice-facing extras list (absolute amounts for display totals). */
export const extrasForInvoiceTotals = (
  extras: InventoryPurchaseExtra[]
): { name: string; amount: number }[] =>
  extras.map((e) => ({
    name: e.name,
    // Keep signed amounts so discounts reduce grand total
    amount: safeNumber(e.amount),
  }));
